package staport.rh.auth.services;

import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import staport.rh.audit.events.ActionSecurite;
import staport.rh.audit.events.EvenementSecurite;
import staport.rh.auth.dtos.response.IdentiteAgentDto;
import staport.rh.auth.dtos.response.JetonAgentResponseDto;
import staport.rh.auth.entities.Utilisateur;
import staport.rh.auth.exceptions.IaDesactiveeException;
import staport.rh.auth.repositories.UtilisateurRepository;
import staport.rh.auth.security.AgentSigningKeys;
import staport.rh.auth.security.EffectivePermissionResolver;
import staport.rh.auth.security.JetonAgent;
import staport.rh.auth.services.interfaces.IAgentService;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class AgentService implements IAgentService {

    private static final String CLAIM_USER_ID = "uid";

    private final UtilisateurRepository utilisateurs;
    private final EffectivePermissionResolver permissions;
    private final AgentSigningKeys cles;
    private final ApplicationEventPublisher evenements;
    private final String emetteur;

    public AgentService(UtilisateurRepository utilisateurs, EffectivePermissionResolver permissions,
                        AgentSigningKeys cles, ApplicationEventPublisher evenements,
                        @Value("${spring.application.name}") String emetteur) {
        this.utilisateurs = utilisateurs;
        this.permissions = permissions;
        this.cles = cles;
        this.evenements = evenements;
        this.emetteur = emetteur;
    }

    @Override
    @Transactional(readOnly = true)
    public JetonAgentResponseDto emettreJeton(Long utilisateurId) {
        RSAKey cle = cles.courante().orElseThrow(IaDesactiveeException::new);
        Optional<IdentiteAgentDto> identite = identiteActive(utilisateurId);
        if (identite.isEmpty()) {
            refuser(utilisateurId, "COMPTE_INACTIF");
        }
        if (!identite.get().permissions().contains(JetonAgent.PERMISSION_IA)) {
            refuser(utilisateurId, "DROIT_IA_RETIRE");
        }
        Instant maintenant = Instant.now();
        // Émission par l'encodeur JWT de Spring Security : l'algorithme, la clé et son identifiant vont dans l'en-tête,
        // la signature est faite par Nimbus derrière cette API standard.
        JwsHeader entete = JwsHeader.with(SignatureAlgorithm.RS256).keyId(cle.getKeyID()).type("JWT").build();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(emetteur)
                .subject(identite.get().username())
                .audience(List.of(JetonAgent.AUDIENCE_IA, JetonAgent.AUDIENCE_MCP))
                .issuedAt(maintenant)
                .notBefore(maintenant)
                .expiresAt(maintenant.plus(JetonAgent.DUREE))
                .id(UUID.randomUUID().toString())
                .claim(CLAIM_USER_ID, identite.get().utilisateurId())
                .claim(JetonAgent.CLAIM_SCOPE, JetonAgent.SCOPE_LECTURE)
                .build();
        Jwt jeton = new NimbusJwtEncoder(new ImmutableJWKSet<>(new JWKSet(cle)))
                .encode(JwtEncoderParameters.from(entete, claims));
        // Le jeton lui-même n'est jamais journalisé : seulement son identifiant et sa durée.
        evenements.publishEvent(EvenementSecurite.avecDetails(ActionSecurite.JETON_AGENT_EMIS,
                identite.get().utilisateurId(), identite.get().username(),
                Map.of("jti", jeton.getId(), "dureeSecondes", JetonAgent.DUREE.toSeconds())));
        return new JetonAgentResponseDto(jeton.getTokenValue(), "Bearer", JetonAgent.DUREE.toSeconds());
    }

    @Override
    public Map<String, Object> clesPubliques() {
        if (cles.courante().isEmpty()) {
            throw new IaDesactiveeException();
        }
        return cles.jwksPublic();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<IdentiteAgentDto> identiteActive(Long utilisateurId) {
        if (utilisateurId == null) {
            return Optional.empty();
        }
        return utilisateurs.findById(utilisateurId)
                .filter(Utilisateur::isActif)
                .map(u -> new IdentiteAgentDto(u.getId(), u.getUsername(), permissions.resolve(u), permissions.roleNames(u)));
    }

    private void refuser(Long utilisateurId, String motif) {
        evenements.publishEvent(EvenementSecurite.avecMotif(ActionSecurite.JETON_AGENT_REFUSE, utilisateurId, null, motif));
        throw new AccessDeniedException("Jeton agent refusé");
    }
}

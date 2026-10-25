package staport.rh.auth.services;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.access.AccessDeniedException;
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
import java.util.Date;
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
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .issuer(emetteur)
                .subject(identite.get().username())
                .audience(List.of(JetonAgent.AUDIENCE_IA, JetonAgent.AUDIENCE_MCP))
                .issueTime(Date.from(maintenant))
                .notBeforeTime(Date.from(maintenant))
                .expirationTime(Date.from(maintenant.plus(JetonAgent.DUREE)))
                .jwtID(UUID.randomUUID().toString())
                .claim(CLAIM_USER_ID, identite.get().utilisateurId())
                .claim(JetonAgent.CLAIM_SCOPE, JetonAgent.SCOPE_LECTURE)
                .build();
        SignedJWT jeton = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(cle.getKeyID())
                .type(JOSEObjectType.JWT).build(), claims);
        try {
            jeton.sign(new RSASSASigner(cle));
        } catch (JOSEException e) {
            throw new IllegalStateException("Signature du jeton agent impossible", e);
        }
        // Le jeton lui-même n'est jamais journalisé : seulement son identifiant et sa durée.
        evenements.publishEvent(EvenementSecurite.avecDetails(ActionSecurite.JETON_AGENT_EMIS,
                identite.get().utilisateurId(), identite.get().username(),
                Map.of("jti", claims.getJWTID(), "dureeSecondes", JetonAgent.DUREE.toSeconds())));
        return new JetonAgentResponseDto(jeton.serialize(), "Bearer", JetonAgent.DUREE.toSeconds());
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

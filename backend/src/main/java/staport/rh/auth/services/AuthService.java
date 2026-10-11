package staport.rh.auth.services;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import staport.rh.audit.events.ActionSecurite;
import staport.rh.audit.events.EvenementSecurite;
import staport.rh.auth.dtos.response.LoginResponseDto;
import staport.rh.auth.entities.RefreshToken;
import staport.rh.auth.entities.ResetPasswordToken;
import staport.rh.auth.entities.Utilisateur;
import staport.rh.auth.exceptions.InvalidCredentialsException;
import staport.rh.auth.exceptions.InvalidRefreshTokenException;
import staport.rh.auth.exceptions.InvalidResetTokenException;
import staport.rh.auth.mail.EmailService;
import staport.rh.auth.mappers.UserMapper;
import staport.rh.auth.repositories.RefreshTokenRepository;
import staport.rh.auth.repositories.ResetPasswordTokenRepository;
import staport.rh.auth.repositories.UtilisateurRepository;
import staport.rh.auth.security.EffectivePermissionResolver;
import staport.rh.auth.security.JwtService;
import staport.rh.auth.security.PolitiqueMotDePasse;
import staport.rh.auth.security.TokenHasher;
import staport.rh.auth.services.interfaces.IAuthService;

import staport.rh.parametre.services.interfaces.IParametreService;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

@Service
public class AuthService implements IAuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private final UtilisateurRepository utilisateurRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final ResetPasswordTokenRepository resetPasswordTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final TokenHasher tokenHasher;
    private final EffectivePermissionResolver permissionResolver;
    private final UserMapper userMapper;
    private final EmailService emailService;
    private final ApplicationEventPublisher evenements;
    private final IParametreService parametres;
    private final PolitiqueMotDePasse politiqueMotDePasse;
    /** Empreinte d'un mot de passe que personne ne connaît : comparée quand le compte n'existe pas (voir {@link #login}). */
    private final String empreinteFactice;

    public AuthService(UtilisateurRepository utilisateurRepository, RefreshTokenRepository refreshTokenRepository,
                        ResetPasswordTokenRepository resetPasswordTokenRepository, PasswordEncoder passwordEncoder,
                        JwtService jwtService, TokenHasher tokenHasher, EffectivePermissionResolver permissionResolver,
                        UserMapper userMapper, EmailService emailService,
                        ApplicationEventPublisher evenements, IParametreService parametres,
                        PolitiqueMotDePasse politiqueMotDePasse) {
        this.utilisateurRepository = utilisateurRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.resetPasswordTokenRepository = resetPasswordTokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.tokenHasher = tokenHasher;
        this.permissionResolver = permissionResolver;
        this.userMapper = userMapper;
        this.emailService = emailService;
        this.evenements = evenements;
        this.parametres = parametres;
        this.politiqueMotDePasse = politiqueMotDePasse;
        this.empreinteFactice = passwordEncoder.encode(UUID.randomUUID().toString());
    }

    @Override
    @Transactional
    public Connexion login(String username, String motDePasse) {
        Optional<Utilisateur> trouve = utilisateurRepository.findByUsername(username);
        if (trouve.isEmpty()) {
            // Même travail de hachage que pour un compte existant : sans lui, la rapidité de la réponse révélerait qu'un
            // identifiant n'existe pas (conventions/security.md, « Principes »).
            passwordEncoder.matches(motDePasse, empreinteFactice);
            // L'identifiant saisi n'est pas conservé : il peut être un mot de passe tapé au mauvais endroit.
            evenements.publishEvent(EvenementSecurite.avecMotif(ActionSecurite.CONNEXION_ECHOUEE, null, null, "COMPTE_INCONNU"));
            throw new InvalidCredentialsException();
        }
        Utilisateur utilisateur = trouve.get();

        // Le mot de passe est toujours vérifié, même pour un compte inactif : la durée de la réponse ne distingue pas les cas.
        boolean motDePasseValide = passwordEncoder.matches(motDePasse, utilisateur.getMotDePasseHash());
        if (!utilisateur.isActif()) {
            refuserConnexion(utilisateur, "COMPTE_INACTIF");
        }
        if (!motDePasseValide) {
            refuserConnexion(utilisateur, "IDENTIFIANTS_INVALIDES");
        }

        log.info("Connexion réussie : utilisateurId={}", utilisateur.getId());
        Connexion connexion = emettreConnexion(utilisateur, UUID.randomUUID().toString());
        evenements.publishEvent(EvenementSecurite.pour(ActionSecurite.CONNEXION_REUSSIE, utilisateur.getId(), utilisateur.getUsername()));
        return connexion;
    }

    /**
     * Rotation à usage unique. Un token déjà révoqué qui est présenté de nouveau signale un vol possible
     * (le voleur et le propriétaire légitime ont chacun le même token) : toute la famille du token est
     * alors révoquée, ce qui force une reconnexion complète. {@code noRollbackFor} : cette révocation doit
     * rester enregistrée même si la méthode se termine par l'exception qui rejette la requête.
     */
    @Override
    @Transactional(noRollbackFor = InvalidRefreshTokenException.class)
    public Connexion refresh(String refreshTokenBrut) {
        RefreshToken existant = refreshTokenRepository.findByTokenHash(tokenHasher.hasher(refreshTokenBrut))
                .orElse(null);
        if (existant == null) {
            evenements.publishEvent(EvenementSecurite.avecMotif(ActionSecurite.SESSION_RENOUVELLEMENT_REFUSE,
                    null, null, "JETON_INCONNU"));
            throw new InvalidRefreshTokenException();
        }

        if (existant.isRevoque()) {
            List<RefreshToken> famille = refreshTokenRepository.findAllByFamilleAndRevoqueFalse(existant.getFamille());
            famille.forEach(token -> token.setRevoque(true));
            refreshTokenRepository.saveAll(famille);
            log.warn("Refresh token déjà consommé réutilisé : famille révoquée ({} token(s) actif(s)), utilisateurId={}",
                    famille.size(), existant.getUtilisateur().getId());
            evenements.publishEvent(EvenementSecurite.avecDetails(ActionSecurite.JETON_REUTILISE, existant.getUtilisateur().getId(),
                    existant.getUtilisateur().getUsername(), Map.of("sessionsRevoquees", famille.size())));
            throw new InvalidRefreshTokenException();
        }
        if (existant.getExpireLe().isBefore(Instant.now())) {
            evenements.publishEvent(EvenementSecurite.avecMotif(ActionSecurite.SESSION_RENOUVELLEMENT_REFUSE,
                    existant.getUtilisateur().getId(), existant.getUtilisateur().getUsername(), "JETON_EXPIRE"));
            throw new InvalidRefreshTokenException();
        }

        existant.setRevoque(true);
        refreshTokenRepository.save(existant);

        // Une session ne survit pas à la désactivation du compte, quelle que soit la façon dont il a été désactivé.
        Utilisateur proprietaire = existant.getUtilisateur();
        if (!proprietaire.isActif()) {
            evenements.publishEvent(EvenementSecurite.avecMotif(ActionSecurite.SESSION_RENOUVELLEMENT_REFUSE,
                    proprietaire.getId(), proprietaire.getUsername(), "COMPTE_INACTIF"));
            throw new InvalidRefreshTokenException();
        }

        Connexion connexion = emettreConnexion(proprietaire, existant.getFamille());
        evenements.publishEvent(EvenementSecurite.pour(ActionSecurite.SESSION_RENOUVELEE, proprietaire.getId(),
                proprietaire.getUsername()));
        return connexion;
    }

    @Override
    @Transactional
    public void logout(String refreshTokenBrut) {
        if (refreshTokenBrut == null || refreshTokenBrut.isBlank()) {
            evenements.publishEvent(EvenementSecurite.de(ActionSecurite.DECONNEXION));
            return;
        }
        RefreshToken token = refreshTokenRepository.findByTokenHash(tokenHasher.hasher(refreshTokenBrut)).orElse(null);
        if (token == null) {
            evenements.publishEvent(EvenementSecurite.avecMotif(ActionSecurite.DECONNEXION,
                    null, null, "SESSION_INCONNUE"));
            return;
        }
        token.setRevoque(true);
        refreshTokenRepository.save(token);
        evenements.publishEvent(EvenementSecurite.pour(ActionSecurite.DECONNEXION, token.getUtilisateur().getId(),
                token.getUtilisateur().getUsername()));
    }

    @Override
    @Transactional
    public void demanderReinitialisationMotDePasse(String email) {
        Optional<Utilisateur> compte = utilisateurRepository.findByEmail(email);
        // Un événement à chaque demande (repère les demandes en rafale) : le compte seulement s'il existe, jamais l'adresse saisie.
        evenements.publishEvent(compte
                .map(u -> EvenementSecurite.pour(ActionSecurite.MOT_DE_PASSE_OUBLIE, u.getId(), u.getUsername()))
                .orElseGet(() -> EvenementSecurite.de(ActionSecurite.MOT_DE_PASSE_OUBLIE)));
        compte.ifPresent(utilisateur -> {
            String tokenBrut = tokenHasher.genererTokenBrut();

            ResetPasswordToken token = new ResetPasswordToken();
            token.setUtilisateur(utilisateur);
            token.setTokenHash(tokenHasher.hasher(tokenBrut));
            token.setExpireLe(Instant.now().plus(parametres.dureeLienReinitialisation()));
            resetPasswordTokenRepository.save(token);

            emailService.envoyerLienReinitialisation(utilisateur.getEmail(), tokenBrut, parametres.dureeLienReinitialisation());
        });
        // Réponse identique que l'email existe ou non — ne jamais révéler si un compte existe.
    }

    @Override
    @Transactional
    public void reinitialiserMotDePasse(String tokenBrut, String nouveauMotDePasse) {
        ResetPasswordToken token = resetPasswordTokenRepository.findByTokenHash(tokenHasher.hasher(tokenBrut))
                .orElseThrow(InvalidResetTokenException::new);

        if (token.isUtilise() || token.getExpireLe().isBefore(Instant.now())) {
            throw new InvalidResetTokenException();
        }

        Utilisateur utilisateur = token.getUtilisateur();
        // Avant de consommer le lien : un mot de passe refusé ne brûle pas le lien, l'utilisateur peut resaisir.
        politiqueMotDePasse.exiger(nouveauMotDePasse, utilisateur.getUsername());
        utilisateur.setMotDePasseHash(passwordEncoder.encode(nouveauMotDePasse));
        utilisateurRepository.save(utilisateur);

        token.setUtilise(true);
        resetPasswordTokenRepository.save(token);

        revoquerSessions(utilisateur.getId());

        log.info("Mot de passe réinitialisé via lien email : utilisateurId={}", utilisateur.getId());
        evenements.publishEvent(EvenementSecurite.pour(ActionSecurite.MOT_DE_PASSE_REINITIALISE, utilisateur.getId(), utilisateur.getUsername()));
    }

    @Override
    @Transactional
    public int revoquerSessions(Long utilisateurId) {
        List<RefreshToken> actifs = refreshTokenRepository.findAllByUtilisateur_IdAndRevoqueFalse(utilisateurId);
        actifs.forEach(token -> token.setRevoque(true));
        refreshTokenRepository.saveAll(actifs);
        if (!actifs.isEmpty()) {
            evenements.publishEvent(EvenementSecurite.avecDetails(ActionSecurite.SESSIONS_REVOQUEES, null, null,
                    Map.of("utilisateurCibleId", utilisateurId, "nombre", actifs.size())));
        }
        return actifs.size();
    }

    /** La réponse reste identique quel que soit le motif (conventions/security.md) : seul le journal le connaît. */
    private void refuserConnexion(Utilisateur utilisateur, String motif) {
        evenements.publishEvent(EvenementSecurite.avecMotif(ActionSecurite.CONNEXION_ECHOUEE, utilisateur.getId(), utilisateur.getUsername(), motif));
        throw new InvalidCredentialsException();
    }

    @Override
    public int longueurMinimaleMotDePasse() {
        return politiqueMotDePasse.longueurMin();
    }

    private Connexion emettreConnexion(Utilisateur utilisateur, String famille) {
        Set<String> permissions = permissionResolver.resolve(utilisateur);
        Set<String> roles = permissionResolver.roleNames(utilisateur);
        String accessToken = jwtService.genererAccessToken(utilisateur, permissions, roles);

        String refreshTokenBrut = tokenHasher.genererTokenBrut();
        RefreshToken refreshToken = new RefreshToken();
        refreshToken.setUtilisateur(utilisateur);
        refreshToken.setFamille(famille);
        refreshToken.setTokenHash(tokenHasher.hasher(refreshTokenBrut));
        Duration dureeSession = parametres.dureeJetonSession();
        refreshToken.setExpireLe(Instant.now().plus(dureeSession));
        refreshTokenRepository.save(refreshToken);

        LoginResponseDto reponse = new LoginResponseDto(accessToken, userMapper.toDto(utilisateur, permissions));
        return new Connexion(reponse, refreshTokenBrut, dureeSession);
    }
}

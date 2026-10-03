package staport.rh.auth.services;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
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
import staport.rh.auth.security.TokenHasher;
import staport.rh.auth.services.interfaces.IAuthService;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
public class AuthService implements IAuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    public static final Duration REFRESH_TOKEN_TTL = Duration.ofDays(30);
    private static final Duration RESET_TOKEN_TTL = Duration.ofHours(1);

    private final UtilisateurRepository utilisateurRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final ResetPasswordTokenRepository resetPasswordTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final TokenHasher tokenHasher;
    private final EffectivePermissionResolver permissionResolver;
    private final UserMapper userMapper;
    private final EmailService emailService;

    public AuthService(UtilisateurRepository utilisateurRepository, RefreshTokenRepository refreshTokenRepository,
                        ResetPasswordTokenRepository resetPasswordTokenRepository, PasswordEncoder passwordEncoder,
                        JwtService jwtService, TokenHasher tokenHasher, EffectivePermissionResolver permissionResolver,
                        UserMapper userMapper, EmailService emailService) {
        this.utilisateurRepository = utilisateurRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.resetPasswordTokenRepository = resetPasswordTokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.tokenHasher = tokenHasher;
        this.permissionResolver = permissionResolver;
        this.userMapper = userMapper;
        this.emailService = emailService;
    }

    @Override
    @Transactional
    public Connexion login(String username, String motDePasse) {
        Utilisateur utilisateur = utilisateurRepository.findByUsername(username)
                .orElseThrow(InvalidCredentialsException::new);

        if (!utilisateur.isActif() || !passwordEncoder.matches(motDePasse, utilisateur.getMotDePasseHash())) {
            throw new InvalidCredentialsException();
        }

        log.info("Connexion réussie : username={}", username);
        return emettreConnexion(utilisateur, UUID.randomUUID().toString());
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
                .orElseThrow(InvalidRefreshTokenException::new);

        if (existant.isRevoque()) {
            List<RefreshToken> famille = refreshTokenRepository.findAllByFamilleAndRevoqueFalse(existant.getFamille());
            famille.forEach(token -> token.setRevoque(true));
            refreshTokenRepository.saveAll(famille);
            log.warn("Refresh token déjà consommé réutilisé : famille révoquée ({} token(s) actif(s)), utilisateurId={}",
                    famille.size(), existant.getUtilisateur().getId());
            throw new InvalidRefreshTokenException();
        }
        if (existant.getExpireLe().isBefore(Instant.now())) {
            throw new InvalidRefreshTokenException();
        }

        existant.setRevoque(true);
        refreshTokenRepository.save(existant);

        return emettreConnexion(existant.getUtilisateur(), existant.getFamille());
    }

    @Override
    @Transactional
    public void logout(String refreshTokenBrut) {
        refreshTokenRepository.findByTokenHash(tokenHasher.hasher(refreshTokenBrut))
                .ifPresent(token -> {
                    token.setRevoque(true);
                    refreshTokenRepository.save(token);
                });
    }

    @Override
    @Transactional
    public void demanderReinitialisationMotDePasse(String email) {
        utilisateurRepository.findByEmail(email).ifPresent(utilisateur -> {
            String tokenBrut = tokenHasher.genererTokenBrut();

            ResetPasswordToken token = new ResetPasswordToken();
            token.setUtilisateur(utilisateur);
            token.setTokenHash(tokenHasher.hasher(tokenBrut));
            token.setExpireLe(Instant.now().plus(RESET_TOKEN_TTL));
            resetPasswordTokenRepository.save(token);

            emailService.envoyerLienReinitialisation(utilisateur.getEmail(), tokenBrut);
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
        utilisateur.setMotDePasseHash(passwordEncoder.encode(nouveauMotDePasse));
        utilisateurRepository.save(utilisateur);

        token.setUtilise(true);
        resetPasswordTokenRepository.save(token);

        List<RefreshToken> actifs = refreshTokenRepository.findAllByUtilisateur_IdAndRevoqueFalse(utilisateur.getId());
        actifs.forEach(rt -> rt.setRevoque(true));
        refreshTokenRepository.saveAll(actifs);

        log.info("Mot de passe réinitialisé via lien email : utilisateurId={}", utilisateur.getId());
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
        refreshToken.setExpireLe(Instant.now().plus(REFRESH_TOKEN_TTL));
        refreshTokenRepository.save(refreshToken);

        LoginResponseDto reponse = new LoginResponseDto(accessToken, userMapper.toDto(utilisateur, permissions));
        return new Connexion(reponse, refreshTokenBrut);
    }
}

package staport.rh.auth.services;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import staport.rh.audit.events.ActionSecurite;
import staport.rh.audit.events.EvenementSecurite;
import staport.rh.auth.dtos.response.UserResponseDto;
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
import staport.rh.support.ParametresDeTest;
import staport.rh.auth.security.TokenHasher;
import staport.rh.auth.services.interfaces.IAuthService;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private UtilisateurRepository utilisateurRepository;
    @Mock
    private RefreshTokenRepository refreshTokenRepository;
    @Mock
    private ResetPasswordTokenRepository resetPasswordTokenRepository;
    @Mock
    private PasswordEncoder passwordEncoder;
    @Mock
    private JwtService jwtService;
    @Mock
    private TokenHasher tokenHasher;
    @Mock
    private EffectivePermissionResolver permissionResolver;
    @Mock
    private UserMapper userMapper;
    @Mock
    private EmailService emailService;
    @Mock
    private ApplicationEventPublisher evenements;

    private AuthService authService;
    private Utilisateur utilisateur;

    @BeforeEach
    void setUp() {
        when(passwordEncoder.encode(any())).thenReturn("empreinte-factice");
        authService = new AuthService(utilisateurRepository, refreshTokenRepository, resetPasswordTokenRepository,
                passwordEncoder, jwtService, tokenHasher, permissionResolver, userMapper, emailService, evenements,
                ParametresDeTest.parDefaut(), new PolitiqueMotDePasse(ParametresDeTest.parDefaut()));

        utilisateur = new Utilisateur();
        utilisateur.setId(1L);
        utilisateur.setUsername("hmayda");
        utilisateur.setEmail("hmayda@staport.ma");
        utilisateur.setMotDePasseHash("hash");
        utilisateur.setActif(true);
    }

    private void stubEmission() {
        when(permissionResolver.resolve(utilisateur)).thenReturn(Set.of("EMPLOYEE_READ"));
        when(permissionResolver.roleNames(utilisateur)).thenReturn(Set.of("SYSTEM_ADMIN"));
        when(jwtService.genererAccessToken(eq(utilisateur), any(), any())).thenReturn("access-token");
        when(tokenHasher.genererTokenBrut()).thenReturn("refresh-brut");
        when(tokenHasher.hasher("refresh-brut")).thenReturn("refresh-hash");
        when(userMapper.toDto(eq(utilisateur), any())).thenReturn(
                new UserResponseDto(1L, 0L, "hmayda", "hmayda@staport.ma", true, null, Set.of(), Set.of(), Set.of("EMPLOYEE_READ")));
    }

    @Test
    void login_devraitReussirAvecIdentifiantsValides() {
        when(utilisateurRepository.findByUsernameForUpdate("hmayda")).thenReturn(Optional.of(utilisateur));
        when(passwordEncoder.matches("bonMotDePasse", "hash")).thenReturn(true);
        stubEmission();

        IAuthService.Connexion connexion = authService.login("hmayda", "bonMotDePasse");

        assertThat(connexion.refreshTokenBrut()).isEqualTo("refresh-brut");
        assertThat(connexion.reponse().accessToken()).isEqualTo("access-token");
        assertThat(connexion.dureeSession()).as("le cookie reprend la durée du paramètre").isEqualTo(Duration.ofHours(12));
        verify(refreshTokenRepository).save(any(RefreshToken.class));
    }

    @Test
    void login_devraitEchouerAvecMotDePasseInvalide() {
        when(utilisateurRepository.findByUsernameForUpdate("hmayda")).thenReturn(Optional.of(utilisateur));
        when(passwordEncoder.matches("mauvais", "hash")).thenReturn(false);

        assertThatThrownBy(() -> authService.login("hmayda", "mauvais"))
                .isInstanceOf(InvalidCredentialsException.class);

        assertThat(utilisateur.getNombreEchecsConnexion()).isEqualTo(1);
        assertThat(utilisateur.getDerniereEchecConnexion()).isNotNull();
        assertThat(utilisateur.getVerrouillageJusqua()).isNull();
        verify(refreshTokenRepository, never()).save(any());
    }

    @Test
    void login_devraitBloquerQuinzeMinutesAuCinquiemeEchecDansLaFenetre() {
        utilisateur.setNombreEchecsConnexion(4);
        utilisateur.setDerniereEchecConnexion(Instant.now().minusSeconds(60));
        when(utilisateurRepository.findByUsernameForUpdate("hmayda")).thenReturn(Optional.of(utilisateur));
        when(passwordEncoder.matches("mauvais", "hash")).thenReturn(false);

        assertThatThrownBy(() -> authService.login("hmayda", "mauvais"))
                .isInstanceOf(InvalidCredentialsException.class);

        assertThat(utilisateur.getNombreEchecsConnexion()).isEqualTo(5);
        assertThat(utilisateur.getVerrouillageJusqua()).isAfter(Instant.now())
                .isBefore(Instant.now().plusSeconds(901));
        verify(evenements).publishEvent(EvenementSecurite.avecDetails(ActionSecurite.COMPTE_BLOQUE_TEMPORAIREMENT,
                1L, "hmayda", Map.of("tentatives", 5, "fenetreMinutes", 15L, "dureeMinutes", 15L)));
    }

    @Test
    void login_devraitRefuserLeCompteVerrouilleMemeAvecLeBonMotDePasse() {
        utilisateur.setNombreEchecsConnexion(5);
        utilisateur.setVerrouillageJusqua(Instant.now().plusSeconds(300));
        when(utilisateurRepository.findByUsernameForUpdate("hmayda")).thenReturn(Optional.of(utilisateur));
        when(passwordEncoder.matches("bonMotDePasse", "hash")).thenReturn(true);

        assertThatThrownBy(() -> authService.login("hmayda", "bonMotDePasse"))
                .isInstanceOf(InvalidCredentialsException.class);

        assertThat(utilisateur.getNombreEchecsConnexion()).isEqualTo(5);
        verify(evenements).publishEvent(EvenementSecurite.avecMotif(ActionSecurite.CONNEXION_ECHOUEE,
                1L, "hmayda", "COMPTE_TEMPORAIREMENT_BLOQUE"));
        verify(refreshTokenRepository, never()).save(any());
    }

    @Test
    void login_devraitReinitialiserLeCompteurApresQuinzeMinutesSansEchec() {
        utilisateur.setNombreEchecsConnexion(4);
        utilisateur.setDerniereEchecConnexion(Instant.now().minusSeconds(901));
        when(utilisateurRepository.findByUsernameForUpdate("hmayda")).thenReturn(Optional.of(utilisateur));
        when(passwordEncoder.matches("mauvais", "hash")).thenReturn(false);

        assertThatThrownBy(() -> authService.login("hmayda", "mauvais"))
                .isInstanceOf(InvalidCredentialsException.class);

        assertThat(utilisateur.getNombreEchecsConnexion()).isEqualTo(1);
        assertThat(utilisateur.getVerrouillageJusqua()).isNull();
    }

    @Test
    void loginReussiDevraitEffacerLeCompteur() {
        utilisateur.setNombreEchecsConnexion(3);
        utilisateur.setDerniereEchecConnexion(Instant.now().minusSeconds(60));
        when(utilisateurRepository.findByUsernameForUpdate("hmayda")).thenReturn(Optional.of(utilisateur));
        when(passwordEncoder.matches("bonMotDePasse", "hash")).thenReturn(true);
        stubEmission();

        authService.login("hmayda", "bonMotDePasse");

        assertThat(utilisateur.getNombreEchecsConnexion()).isZero();
        assertThat(utilisateur.getDerniereEchecConnexion()).isNull();
        assertThat(utilisateur.getVerrouillageJusqua()).isNull();
    }

    @Test
    void login_devraitEchouerSiUtilisateurInactif() {
        utilisateur.setActif(false);
        when(utilisateurRepository.findByUsernameForUpdate("hmayda")).thenReturn(Optional.of(utilisateur));

        assertThatThrownBy(() -> authService.login("hmayda", "peuImporte"))
                .isInstanceOf(InvalidCredentialsException.class);

        // Le mot de passe est vérifié quand même : la durée de la réponse ne distingue pas un compte inactif d'un mot de passe faux.
        verify(passwordEncoder).matches("peuImporte", "hash");
    }

    @Test
    void login_devraitEchouerSiUtilisateurInconnu() {
        when(utilisateurRepository.findByUsernameForUpdate("inconnu")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> authService.login("inconnu", "peuImporte"))
                .isInstanceOf(InvalidCredentialsException.class);

        // Même travail de hachage que pour un compte existant : la rapidité de la réponse ne révèle pas qu'il n'existe pas.
        verify(passwordEncoder).matches("peuImporte", "empreinte-factice");
    }

    @Test
    void refresh_devraitPivoterLeTokenEtRevoquerLAncien() {
        RefreshToken existant = new RefreshToken();
        existant.setUtilisateur(utilisateur);
        existant.setTokenHash("ancien-hash");
        existant.setExpireLe(Instant.now().plusSeconds(3600));
        existant.setRevoque(false);

        when(tokenHasher.hasher("ancien-brut")).thenReturn("ancien-hash");
        when(refreshTokenRepository.findByTokenHash("ancien-hash")).thenReturn(Optional.of(existant));
        stubEmission();

        authService.refresh("ancien-brut");

        assertThat(existant.isRevoque()).isTrue();
        ArgumentCaptor<RefreshToken> captor = ArgumentCaptor.forClass(RefreshToken.class);
        verify(refreshTokenRepository, org.mockito.Mockito.times(2)).save(captor.capture());
        assertThat(captor.getAllValues().get(0)).isSameAs(existant);
    }

    @Test
    void refresh_devraitEchouerSiTokenDejaRevoque() {
        RefreshToken existant = new RefreshToken();
        existant.setUtilisateur(utilisateur);
        existant.setFamille("famille-1");
        existant.setExpireLe(Instant.now().plusSeconds(3600));
        existant.setRevoque(true);

        when(tokenHasher.hasher("vole")).thenReturn("hash-vole");
        when(refreshTokenRepository.findByTokenHash("hash-vole")).thenReturn(Optional.of(existant));
        when(refreshTokenRepository.findAllByFamilleAndRevoqueFalse("famille-1")).thenReturn(List.of());

        assertThatThrownBy(() -> authService.refresh("vole"))
                .isInstanceOf(InvalidRefreshTokenException.class);
    }

    @Test
    void refresh_devraitRevoquerToutLaFamilleQuandUnTokenConsommeEstReutilise() {
        RefreshToken consomme = new RefreshToken();
        consomme.setUtilisateur(utilisateur);
        consomme.setFamille("famille-1");
        consomme.setExpireLe(Instant.now().plusSeconds(3600));
        consomme.setRevoque(true);
        // Token actif issu de la dernière rotation, détenu par le propriétaire légitime.
        RefreshToken actif = new RefreshToken();
        actif.setUtilisateur(utilisateur);
        actif.setFamille("famille-1");
        actif.setExpireLe(Instant.now().plusSeconds(3600));

        when(tokenHasher.hasher("rejoue")).thenReturn("hash-rejoue");
        when(refreshTokenRepository.findByTokenHash("hash-rejoue")).thenReturn(Optional.of(consomme));
        when(refreshTokenRepository.findAllByFamilleAndRevoqueFalse("famille-1")).thenReturn(List.of(actif));

        assertThatThrownBy(() -> authService.refresh("rejoue"))
                .isInstanceOf(InvalidRefreshTokenException.class);

        assertThat(actif.isRevoque()).isTrue();
        verify(refreshTokenRepository).saveAll(List.of(actif));
    }

    @Test
    void refresh_devraitConserverLaFamilleLorsDeLaRotation() {
        RefreshToken existant = new RefreshToken();
        existant.setUtilisateur(utilisateur);
        existant.setFamille("famille-1");
        existant.setExpireLe(Instant.now().plusSeconds(3600));

        when(tokenHasher.hasher("ancien-brut")).thenReturn("ancien-hash");
        when(refreshTokenRepository.findByTokenHash("ancien-hash")).thenReturn(Optional.of(existant));
        stubEmission();

        authService.refresh("ancien-brut");

        ArgumentCaptor<RefreshToken> captor = ArgumentCaptor.forClass(RefreshToken.class);
        verify(refreshTokenRepository, org.mockito.Mockito.times(2)).save(captor.capture());
        assertThat(captor.getAllValues().get(1).getFamille()).isEqualTo("famille-1");
    }

    @Test
    void refresh_devraitEchouerSiTokenExpire() {
        RefreshToken existant = new RefreshToken();
        existant.setUtilisateur(utilisateur);
        existant.setExpireLe(Instant.now().minusSeconds(1));
        existant.setRevoque(false);

        when(tokenHasher.hasher("expire")).thenReturn("hash-expire");
        when(refreshTokenRepository.findByTokenHash("hash-expire")).thenReturn(Optional.of(existant));

        assertThatThrownBy(() -> authService.refresh("expire"))
                .isInstanceOf(InvalidRefreshTokenException.class);
    }

    @Test
    void refresh_devraitRefuserUnCompteDesactiveEtJournaliserLeRefus() {
        utilisateur.setActif(false);
        RefreshToken existant = new RefreshToken();
        existant.setUtilisateur(utilisateur);
        existant.setFamille("famille-1");
        existant.setExpireLe(Instant.now().plusSeconds(3600));

        when(tokenHasher.hasher("brut")).thenReturn("hash");
        when(refreshTokenRepository.findByTokenHash("hash")).thenReturn(Optional.of(existant));

        assertThatThrownBy(() -> authService.refresh("brut")).isInstanceOf(InvalidRefreshTokenException.class);

        assertThat(existant.isRevoque()).as("le jeton présenté est consommé").isTrue();
        verify(jwtService, never()).genererAccessToken(any(), any(), any());
        verify(evenements).publishEvent(EvenementSecurite.avecMotif(ActionSecurite.SESSION_RENOUVELLEMENT_REFUSE, 1L, "hmayda", "COMPTE_INACTIF"));
    }

    @Test
    void revoquerSessions_devraitRevoquerTousLesJetonsActifsEtRendreLeurNombre() {
        RefreshToken un = new RefreshToken();
        RefreshToken deux = new RefreshToken();
        when(refreshTokenRepository.findAllByUtilisateur_IdAndRevoqueFalse(1L)).thenReturn(List.of(un, deux));

        int coupees = authService.revoquerSessions(1L);

        assertThat(coupees).isEqualTo(2);
        assertThat(un.isRevoque()).isTrue();
        assertThat(deux.isRevoque()).isTrue();
        verify(refreshTokenRepository).saveAll(List.of(un, deux));
    }

    @Test
    void refresh_devraitEchouerSiTokenInconnu() {
        when(tokenHasher.hasher("inconnu")).thenReturn("hash-inconnu");
        when(refreshTokenRepository.findByTokenHash("hash-inconnu")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> authService.refresh("inconnu"))
                .isInstanceOf(InvalidRefreshTokenException.class);
    }

    @Test
    void logout_devraitRevoquerLeTokenSiTrouve() {
        RefreshToken existant = new RefreshToken();
        existant.setRevoque(false);
        existant.setUtilisateur(utilisateur);
        when(tokenHasher.hasher("brut")).thenReturn("hash");
        when(refreshTokenRepository.findByTokenHash("hash")).thenReturn(Optional.of(existant));

        authService.logout("brut");

        assertThat(existant.isRevoque()).isTrue();
        verify(refreshTokenRepository).save(existant);
        verify(evenements).publishEvent(EvenementSecurite.pour(ActionSecurite.DECONNEXION, 1L, "hmayda"));
    }

    @Test
    void logout_neDevraitRienFaireSiTokenInconnu() {
        when(tokenHasher.hasher("brut")).thenReturn("hash");
        when(refreshTokenRepository.findByTokenHash("hash")).thenReturn(Optional.empty());

        authService.logout("brut");

        verify(refreshTokenRepository, never()).save(any());
    }

    @Test
    void demanderReinitialisationMotDePasse_neDevraitPasReveleQuUnCompteExiste() {
        when(utilisateurRepository.findByEmail("inconnu@x.com")).thenReturn(Optional.empty());

        authService.demanderReinitialisationMotDePasse("inconnu@x.com");

        verify(emailService, never()).envoyerLienReinitialisation(any(), any(), any());
        verify(resetPasswordTokenRepository, never()).save(any());
    }

    @Test
    void demanderReinitialisationMotDePasse_devraitEnvoyerUnEmailSiLeCompteExiste() {
        when(utilisateurRepository.findByEmail("hmayda@staport.ma")).thenReturn(Optional.of(utilisateur));
        when(tokenHasher.genererTokenBrut()).thenReturn("reset-brut");
        when(tokenHasher.hasher("reset-brut")).thenReturn("reset-hash");

        authService.demanderReinitialisationMotDePasse("hmayda@staport.ma");

        verify(emailService).envoyerLienReinitialisation("hmayda@staport.ma", "reset-brut", Duration.ofHours(1));
        verify(resetPasswordTokenRepository).save(any(ResetPasswordToken.class));
    }

    @Test
    void demanderReinitialisationMotDePasse_gardeLaReponseGeneriqueSiLaFileEstPleine() {
        when(utilisateurRepository.findByEmail("hmayda@staport.ma")).thenReturn(Optional.of(utilisateur));
        when(tokenHasher.genererTokenBrut()).thenReturn("reset-brut");
        when(tokenHasher.hasher("reset-brut")).thenReturn("reset-hash");
        doThrow(new TaskRejectedException("file pleine"))
                .when(emailService).envoyerLienReinitialisation("hmayda@staport.ma", "reset-brut", Duration.ofHours(1));

        assertThatCode(() -> authService.demanderReinitialisationMotDePasse("hmayda@staport.ma"))
                .doesNotThrowAnyException();

        verify(resetPasswordTokenRepository).save(any(ResetPasswordToken.class));
        verify(evenements).publishEvent(EvenementSecurite.pour(ActionSecurite.MOT_DE_PASSE_OUBLIE, 1L, "hmayda"));
    }

    @Test
    void reinitialiserMotDePasse_devraitChangerLeMotDePasseEtRevoquerLesTokensActifs() {
        ResetPasswordToken token = new ResetPasswordToken();
        token.setUtilisateur(utilisateur);
        token.setExpireLe(Instant.now().plusSeconds(3600));
        token.setUtilise(false);

        RefreshToken actif = new RefreshToken();
        actif.setRevoque(false);

        when(tokenHasher.hasher("reset-brut")).thenReturn("reset-hash");
        when(resetPasswordTokenRepository.findByTokenHash("reset-hash")).thenReturn(Optional.of(token));
        when(passwordEncoder.encode("NouveauMdp123!")).thenReturn("nouveau-hash");
        when(refreshTokenRepository.findAllByUtilisateur_IdAndRevoqueFalse(1L)).thenReturn(List.of(actif));

        authService.reinitialiserMotDePasse("reset-brut", "NouveauMdp123!");

        assertThat(utilisateur.getMotDePasseHash()).isEqualTo("nouveau-hash");
        assertThat(token.isUtilise()).isTrue();
        assertThat(actif.isRevoque()).isTrue();
        verify(refreshTokenRepository).saveAll(List.of(actif));
    }

    @Test
    void reinitialiserMotDePasse_devraitRefuserUnMotDePasseNonConformeSansConsommerLeLien() {
        ResetPasswordToken token = new ResetPasswordToken();
        token.setUtilisateur(utilisateur);
        token.setExpireLe(Instant.now().plusSeconds(3600));
        token.setUtilise(false);
        when(tokenHasher.hasher("reset-brut")).thenReturn("reset-hash");
        when(resetPasswordTokenRepository.findByTokenHash("reset-hash")).thenReturn(Optional.of(token));

        assertThatThrownBy(() -> authService.reinitialiserMotDePasse("reset-brut", "court1"))
                .isInstanceOf(staport.rh.auth.exceptions.MotDePasseNonConformeException.class);

        assertThat(token.isUtilise()).as("le lien reste utilisable").isFalse();
        assertThat(utilisateur.getMotDePasseHash()).isEqualTo("hash");
        verify(refreshTokenRepository, never()).findAllByUtilisateur_IdAndRevoqueFalse(any());
    }

    @Test
    void reinitialiserMotDePasse_devraitEchouerSiTokenDejaUtilise() {
        ResetPasswordToken token = new ResetPasswordToken();
        token.setExpireLe(Instant.now().plusSeconds(3600));
        token.setUtilise(true);

        when(tokenHasher.hasher("reset-brut")).thenReturn("reset-hash");
        when(resetPasswordTokenRepository.findByTokenHash("reset-hash")).thenReturn(Optional.of(token));

        assertThatThrownBy(() -> authService.reinitialiserMotDePasse("reset-brut", "NouveauMdp123!"))
                .isInstanceOf(InvalidResetTokenException.class);

        verify(utilisateurRepository, never()).save(any());
    }
}

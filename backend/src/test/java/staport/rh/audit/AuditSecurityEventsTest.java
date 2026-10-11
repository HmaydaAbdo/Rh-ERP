package staport.rh.audit;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import staport.rh.audit.support.AuditIntegrationTestBase;
import staport.rh.audit.support.AuthentificationDeTest;
import staport.rh.auth.dtos.request.AdminResetPasswordRequestDto;
import staport.rh.auth.dtos.request.UserCreateRequestDto;
import staport.rh.auth.dtos.request.UserUpdateRequestDto;
import staport.rh.auth.dtos.response.UserResponseDto;
import staport.rh.auth.entities.Utilisateur;
import staport.rh.auth.exceptions.InvalidCredentialsException;
import staport.rh.auth.exceptions.InvalidRefreshTokenException;
import staport.rh.auth.exceptions.MotDePasseNonConformeException;
import staport.rh.auth.mail.EmailService;
import staport.rh.auth.security.JwtService;
import staport.rh.auth.services.interfaces.IAuthService;
import staport.rh.auth.services.interfaces.IUserService;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Scénarios S18 à S23 : les événements de sécurité — connexions, jetons, mots de passe, accès refusés — sont écrits dans
 * le journal, avec le strict nécessaire (jamais de mot de passe, d'identifiant inconnu ni d'adresse saisie).
 */
@AutoConfigureMockMvc
class AuditSecurityEventsTest extends AuditIntegrationTestBase {

    private static final String MOT_DE_PASSE = "motdepasse-1";

    @Autowired
    private IAuthService authService;
    @Autowired
    private IUserService userService;
    @Autowired
    private JwtService jwtService;
    @Autowired
    private MockMvc mockMvc;
    @MockitoBean
    private EmailService emailService;

    private UserResponseDto creerCompte(String s) {
        return userService.create(new UserCreateRequestDto("u" + s, s + "@exemple.test", MOT_DE_PASSE, null, Set.of()));
    }

    private long dernierId() {
        return jdbc.queryForObject("SELECT COALESCE(max(id), 0) FROM audit_journal", Long.class);
    }

    /** Les entrées de sécurité écrites après le repère, de l'action demandée. */
    private List<Map<String, Object>> evenementsDepuis(long repere, String action) {
        return jdbc.queryForList("SELECT * FROM audit_journal WHERE id > ? AND categorie = 'SECURITE' AND action = ? ORDER BY id", repere, action);
    }

    private Map<String, Object> unEvenementDepuis(long repere, String action) {
        List<Map<String, Object>> evenements = evenementsDepuis(repere, action);
        assertThat(evenements).as("événements %s", action).hasSize(1);
        return evenements.get(0);
    }

    @Test
    void une_connexion_reussie_est_tracee_au_nom_du_compte() {
        String s = Long.toHexString(System.nanoTime());
        UserResponseDto compte = creerCompte(s);
        AuthentificationDeTest.deconnecter();
        long repere = dernierId();

        authService.login("u" + s, MOT_DE_PASSE);

        Map<String, Object> evenement = unEvenementDepuis(repere, "CONNEXION_REUSSIE");
        assertThat(evenement.get("utilisateur_id")).isEqualTo(compte.id());
        assertThat(evenement.get("utilisateur_nom")).isEqualTo("u" + s);
        assertThat(evenement.get("resultat")).isEqualTo("SUCCES");
        assertThat(evenement.get("origine")).isEqualTo("API");
    }

    @Test
    void une_connexion_echouee_garde_son_motif_et_ne_conserve_l_identifiant_que_s_il_correspond_a_un_compte() {
        String s = Long.toHexString(System.nanoTime());
        creerCompte(s);
        AuthentificationDeTest.deconnecter();
        long repere = dernierId();

        assertThatThrownBy(() -> authService.login("u" + s, "mauvais-mot-de-passe")).isInstanceOf(InvalidCredentialsException.class);
        assertThatThrownBy(() -> authService.login("secret-tape-au-mauvais-endroit-" + s, MOT_DE_PASSE)).isInstanceOf(InvalidCredentialsException.class);

        List<Map<String, Object>> echecs = evenementsDepuis(repere, "CONNEXION_ECHOUEE");
        assertThat(echecs).hasSize(2);
        assertThat(echecs.get(0).get("motif")).isEqualTo("IDENTIFIANTS_INVALIDES");
        assertThat(echecs.get(0).get("utilisateur_nom")).isEqualTo("u" + s);
        assertThat(echecs.get(0).get("resultat")).isEqualTo("ECHEC");
        assertThat(echecs.get(1).get("motif")).isEqualTo("COMPTE_INCONNU");
        assertThat(echecs.get(1).get("utilisateur_nom")).isEqualTo("Anonyme");
        assertThat(echecs.get(1).toString()).as("ni l'identifiant ni le mot de passe saisis").doesNotContain("secret-tape").doesNotContain(MOT_DE_PASSE);
    }

    @Test
    void un_compte_inactif_qui_se_connecte_est_trace_avec_son_motif() {
        String s = Long.toHexString(System.nanoTime());
        UserResponseDto compte = creerCompte(s);
        userService.update(compte.id(), new UserUpdateRequestDto(compte.email(), false, null, Set.of()));
        AuthentificationDeTest.deconnecter();
        long repere = dernierId();

        assertThatThrownBy(() -> authService.login("u" + s, MOT_DE_PASSE)).isInstanceOf(InvalidCredentialsException.class);

        assertThat(unEvenementDepuis(repere, "CONNEXION_ECHOUEE").get("motif")).isEqualTo("COMPTE_INACTIF");
    }

    @Test
    void desactiver_un_compte_coupe_ses_sessions_et_en_interdit_le_renouvellement() {
        String s = Long.toHexString(System.nanoTime());
        UserResponseDto compte = creerCompte(s);
        AuthentificationDeTest.deconnecter();
        IAuthService.Connexion ouverte = authService.login("u" + s, MOT_DE_PASSE);
        IAuthService.Connexion autreAppareil = authService.login("u" + s, MOT_DE_PASSE);
        AuthentificationDeTest.connecter(UTILISATEUR_ID, UTILISATEUR_NOM);

        userService.update(compte.id(), new UserUpdateRequestDto(compte.email(), false, null, Set.of()));

        assertThat(jdbc.queryForObject("SELECT count(*) FROM refresh_token WHERE utilisateur_id = ? AND NOT revoque", Long.class, compte.id()))
                .as("plus aucune session active").isZero();
        AuthentificationDeTest.deconnecter();
        assertThatThrownBy(() -> authService.refresh(ouverte.refreshTokenBrut())).isInstanceOf(InvalidRefreshTokenException.class);
        assertThatThrownBy(() -> authService.refresh(autreAppareil.refreshTokenBrut())).isInstanceOf(InvalidRefreshTokenException.class);
    }

    @Test
    void modifier_un_compte_sans_le_desactiver_laisse_ses_sessions_ouvertes() {
        String s = Long.toHexString(System.nanoTime());
        UserResponseDto compte = creerCompte(s);
        AuthentificationDeTest.deconnecter();
        IAuthService.Connexion connexion = authService.login("u" + s, MOT_DE_PASSE);
        AuthentificationDeTest.connecter(UTILISATEUR_ID, UTILISATEUR_NOM);

        userService.update(compte.id(), new UserUpdateRequestDto("autre-" + s + "@exemple.test", true, null, Set.of()));

        AuthentificationDeTest.deconnecter();
        assertThat(authService.refresh(connexion.refreshTokenBrut()).refreshTokenBrut()).isNotBlank();
    }

    @Test
    void la_reinitialisation_par_un_administrateur_coupe_les_sessions_et_trace_leur_nombre() {
        String s = Long.toHexString(System.nanoTime());
        UserResponseDto compte = creerCompte(s);
        AuthentificationDeTest.deconnecter();
        IAuthService.Connexion connexion = authService.login("u" + s, MOT_DE_PASSE);
        AuthentificationDeTest.connecter(UTILISATEUR_ID, UTILISATEUR_NOM);
        long repere = dernierId();

        userService.adminResetPassword(compte.id(), new AdminResetPasswordRequestDto("nouveau-mot-de-passe-2"));

        assertThat(unEvenementDepuis(repere, "MOT_DE_PASSE_REINITIALISE_PAR_ADMIN").get("perimetre").toString()).contains("\"sessionsRevoquees\": 1");
        AuthentificationDeTest.deconnecter();
        assertThatThrownBy(() -> authService.refresh(connexion.refreshTokenBrut())).isInstanceOf(InvalidRefreshTokenException.class);
    }

    @Test
    void un_mot_de_passe_non_conforme_est_refuse_a_la_creation_et_a_la_reinitialisation_sans_couper_les_sessions() {
        String s = Long.toHexString(System.nanoTime());
        assertThatThrownBy(() -> userService.create(new UserCreateRequestDto("u" + s, s + "@exemple.test", "court1", null, Set.of())))
                .isInstanceOf(MotDePasseNonConformeException.class);
        assertThatThrownBy(() -> userService.create(new UserCreateRequestDto("u" + s, s + "@exemple.test", "uniquement-des-lettres", null, Set.of())))
                .isInstanceOf(MotDePasseNonConformeException.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM utilisateur WHERE username = ?", Long.class, "u" + s)).as("aucun compte créé").isZero();

        UserResponseDto compte = creerCompte(s + "b");
        AuthentificationDeTest.deconnecter();
        IAuthService.Connexion connexion = authService.login("u" + s + "b", MOT_DE_PASSE);
        AuthentificationDeTest.connecter(UTILISATEUR_ID, UTILISATEUR_NOM);

        assertThatThrownBy(() -> userService.adminResetPassword(compte.id(), new AdminResetPasswordRequestDto("u" + s + "b")))
                .isInstanceOf(MotDePasseNonConformeException.class);

        AuthentificationDeTest.deconnecter();
        assertThat(authService.refresh(connexion.refreshTokenBrut()).refreshTokenBrut()).as("la session n'a pas été coupée").isNotBlank();
        assertThat(authService.login("u" + s + "b", MOT_DE_PASSE)).as("l'ancien mot de passe fonctionne encore").isNotNull();
    }

    @Test
    void la_deconnexion_est_tracee() {
        String s = Long.toHexString(System.nanoTime());
        creerCompte(s);
        AuthentificationDeTest.deconnecter();
        IAuthService.Connexion connexion = authService.login("u" + s, MOT_DE_PASSE);
        long repere = dernierId();

        authService.logout(connexion.refreshTokenBrut());

        assertThat(unEvenementDepuis(repere, "DECONNEXION").get("utilisateur_nom")).isEqualTo("u" + s);
    }

    @Test
    void la_reutilisation_d_un_jeton_deja_consomme_est_tracee_avec_le_nombre_de_sessions_revoquees() {
        String s = Long.toHexString(System.nanoTime());
        creerCompte(s);
        AuthentificationDeTest.deconnecter();
        IAuthService.Connexion connexion = authService.login("u" + s, MOT_DE_PASSE);
        authService.refresh(connexion.refreshTokenBrut());
        long repere = dernierId();

        assertThatThrownBy(() -> authService.refresh(connexion.refreshTokenBrut())).isInstanceOf(InvalidRefreshTokenException.class);

        Map<String, Object> evenement = unEvenementDepuis(repere, "JETON_REUTILISE");
        assertThat(evenement.get("utilisateur_nom")).isEqualTo("u" + s);
        assertThat(evenement.get("perimetre").toString()).contains("\"sessionsRevoquees\": 1");
    }

    @Test
    void un_mot_de_passe_oublie_est_trace_a_chaque_demande_sans_jamais_conserver_l_adresse_saisie() {
        String s = Long.toHexString(System.nanoTime());
        UserResponseDto compte = creerCompte(s);
        AuthentificationDeTest.deconnecter();
        long repere = dernierId();

        authService.demanderReinitialisationMotDePasse(compte.email());
        authService.demanderReinitialisationMotDePasse("personne-" + s + "@exemple.test");

        List<Map<String, Object>> demandes = evenementsDepuis(repere, "MOT_DE_PASSE_OUBLIE");
        assertThat(demandes).hasSize(2);
        assertThat(demandes.get(0).get("utilisateur_id")).isEqualTo(compte.id());
        assertThat(demandes.get(1).get("utilisateur_id")).as("compte inconnu : aucun compte désigné").isNull();
        assertThat(demandes.get(1).get("utilisateur_nom")).isEqualTo("Anonyme");
        assertThat(demandes.toString()).as("jamais l'adresse saisie").doesNotContain("personne-").doesNotContain("@exemple.test");
        verify(emailService).envoyerLienReinitialisation(anyString(), anyString(), any(Duration.class));
    }

    @Test
    void les_reinitialisations_de_mot_de_passe_sont_tracees_sans_aucune_valeur_de_mot_de_passe() {
        String s = Long.toHexString(System.nanoTime());
        UserResponseDto compte = creerCompte(s);

        long repere = dernierId();
        userService.adminResetPassword(compte.id(), new AdminResetPasswordRequestDto("nouveau-mot-de-passe-2"));
        Map<String, Object> parAdmin = unEvenementDepuis(repere, "MOT_DE_PASSE_REINITIALISE_PAR_ADMIN");
        assertThat(parAdmin.get("utilisateur_nom")).as("l'acteur est l'administrateur authentifié").isEqualTo(UTILISATEUR_NOM);
        assertThat(parAdmin.get("perimetre").toString()).contains("\"cibleId\": " + compte.id());

        AuthentificationDeTest.deconnecter();
        authService.demanderReinitialisationMotDePasse(compte.email());
        ArgumentCaptor<String> jeton = ArgumentCaptor.forClass(String.class);
        verify(emailService).envoyerLienReinitialisation(anyString(), jeton.capture(), any(Duration.class));
        long repereLien = dernierId();
        authService.reinitialiserMotDePasse(jeton.getValue(), "encore-un-autre-3");

        assertThat(unEvenementDepuis(repereLien, "MOT_DE_PASSE_REINITIALISE").get("utilisateur_id")).isEqualTo(compte.id());
        assertThat(jdbc.queryForList("SELECT * FROM audit_journal WHERE id > ?", repere).toString())
                .doesNotContain("nouveau-mot-de-passe").doesNotContain("encore-un-autre").doesNotContain("$2a$").doesNotContain(jeton.getValue());
    }

    private String jeton(Set<String> permissions, Set<String> roles) {
        Utilisateur utilisateur = new Utilisateur();
        utilisateur.setId(UTILISATEUR_ID);
        utilisateur.setUsername(UTILISATEUR_NOM);
        return jwtService.genererAccessToken(utilisateur, permissions, roles);
    }

    @Test
    void un_acces_refuse_sur_une_route_metier_est_trace_avec_la_route_et_l_identifiant_de_requete() throws Exception {
        long repere = dernierId();

        String idRequete = mockMvc.perform(get("/paie/1").header("Authorization", "Bearer " + jeton(Set.of("EMPLOYEE_READ"), Set.of())))
                .andExpect(status().isForbidden())
                .andExpect(header().exists("X-Request-Id"))
                .andReturn().getResponse().getHeader("X-Request-Id");

        Map<String, Object> evenement = unEvenementDepuis(repere, "ACCES_REFUSE");
        assertThat(evenement.get("resultat")).isEqualTo("ECHEC");
        assertThat(evenement.get("utilisateur_id")).isEqualTo(UTILISATEUR_ID);
        assertThat(evenement.get("perimetre").toString()).contains("\"methode\": \"GET\"").contains("\"route\": \"/paie/1\"");
        assertThat(evenement.get("request_id")).as("l'événement porte l'identifiant renvoyé au client").isEqualTo(idRequete);
    }

    @Test
    void un_acces_refuse_par_la_chaine_de_filtres_est_trace_comme_un_refus_de_controleur() throws Exception {
        long repere = dernierId();

        mockMvc.perform(get("/actuator/info").header("Authorization", "Bearer " + jeton(Set.of("PAIE_READ"), Set.of())))
                .andExpect(status().isForbidden());

        assertThat(unEvenementDepuis(repere, "ACCES_REFUSE").get("perimetre").toString()).contains("\"route\": \"/actuator/info\"");
    }

    @Test
    void une_requete_sans_authentification_n_est_pas_un_refus_d_acces() throws Exception {
        long repere = dernierId();

        mockMvc.perform(get("/paie/1")).andExpect(status().isUnauthorized());

        assertThat(evenementsDepuis(repere, "ACCES_REFUSE")).isEmpty();
    }
}

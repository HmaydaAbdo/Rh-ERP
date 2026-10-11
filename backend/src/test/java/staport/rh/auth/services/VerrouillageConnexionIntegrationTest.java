package staport.rh.auth.services;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import staport.rh.audit.support.AuditIntegrationTestBase;
import staport.rh.auth.entities.Utilisateur;
import staport.rh.auth.exceptions.InvalidCredentialsException;
import staport.rh.auth.repositories.UtilisateurRepository;
import staport.rh.auth.services.interfaces.IAuthService;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class VerrouillageConnexionIntegrationTest extends AuditIntegrationTestBase {

    @Autowired
    private IAuthService authService;
    @Autowired
    private UtilisateurRepository utilisateurRepository;
    @Autowired
    private PasswordEncoder passwordEncoder;

    private String username;
    private String email;
    private Long utilisateurId;

    @BeforeEach
    void creerUtilisateur() {
        String suffixe = UUID.randomUUID().toString().replace("-", "");
        username = "lock-" + suffixe.substring(0, 12);
        email = "lock-" + suffixe + "@example.test";

        Utilisateur utilisateur = new Utilisateur();
        utilisateur.setUsername(username);
        utilisateur.setEmail(email);
        utilisateur.setMotDePasseHash(passwordEncoder.encode("mot-de-passe-correct"));
        utilisateur.setActif(true);
        utilisateurId = utilisateurRepository.saveAndFlush(utilisateur).getId();
    }

    @AfterEach
    void supprimerUtilisateur() {
        if (utilisateurId != null) {
            utilisateurRepository.deleteById(utilisateurId);
        }
    }

    @Test
    void loginPersisteLeBlocageApresCinqEchecsEtRefuseLeBonMotDePassePendantQuinzeMinutes() {
        for (int tentative = 0; tentative < 5; tentative++) {
            assertThatThrownBy(() -> authService.login(username, "mauvais"))
                    .isInstanceOf(InvalidCredentialsException.class);
        }

        Utilisateur bloque = utilisateurRepository.findByEmail(email).orElseThrow();
        assertThat(bloque.getNombreEchecsConnexion()).isEqualTo(5);
        assertThat(bloque.getDerniereEchecConnexion()).isNotNull();
        assertThat(bloque.getVerrouillageJusqua()).isAfter(Instant.now())
                .isBefore(Instant.now().plusSeconds(901));

        assertThatThrownBy(() -> authService.login(username, "mot-de-passe-correct"))
                .isInstanceOf(InvalidCredentialsException.class);

        assertThat(utilisateurRepository.findByEmail(email).orElseThrow().getNombreEchecsConnexion()).isEqualTo(5);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_journal WHERE utilisateur_id = ? AND action = 'COMPTE_BLOQUE_TEMPORAIREMENT'",
                Long.class, utilisateurId)).isEqualTo(1L);
    }
}

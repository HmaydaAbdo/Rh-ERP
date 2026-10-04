package staport.rh.audit;

import io.micrometer.core.instrument.MeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import staport.rh.audit.entities.AuditJournalEntry;
import staport.rh.audit.services.AuditJournalWriter;
import staport.rh.audit.support.AuditIntegrationTestBase;
import staport.rh.audit.support.AuthentificationDeTest;
import staport.rh.auth.dtos.request.UserCreateRequestDto;
import staport.rh.auth.services.interfaces.IAuthService;
import staport.rh.auth.services.interfaces.IUserService;
import staport.rh.function.dtos.request.FunctionCreateRequestDto;
import staport.rh.function.services.interfaces.IFunctionService;

import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;

/**
 * Scénario S30 : l'audit ne peut pas s'écrire. <strong>Fermé pour les données</strong> (la modification échoue, rien
 * n'est enregistré sans trace), <strong>ouvert pour la sécurité</strong> (la connexion passe, l'erreur est comptée).
 */
class AuditDefaillanceTest extends AuditIntegrationTestBase {

    @MockitoSpyBean
    private AuditJournalWriter ecrivain;
    @Autowired
    private IFunctionService functionService;
    @Autowired
    private IUserService userService;
    @Autowired
    private IAuthService authService;
    @Autowired
    private MeterRegistry registre;

    @Test
    void si_l_entree_d_une_modification_ne_peut_pas_s_ecrire_la_modification_echoue_et_rien_n_est_enregistre() {
        String libelle = "F-DEFAILLANCE-" + Long.toHexString(System.nanoTime());
        doThrow(new IllegalStateException("disque plein")).when(ecrivain).ecrire(any(AuditJournalEntry.class));

        assertThatThrownBy(() -> functionService.create(new FunctionCreateRequestDto(libelle)))
                .isInstanceOf(IllegalStateException.class).hasMessage("disque plein");

        assertThat(jdbc.queryForObject("SELECT count(*) FROM fonction WHERE libelle = ?", Long.class, libelle))
                .as("une modification sans trace est annulée").isZero();
        // La tentative reste tracée à part (ici l'écriture séparée fonctionne encore).
        Map<String, Object> echec = jdbc.queryForMap("SELECT * FROM audit_journal WHERE action = 'FONCTION_CREATION' AND resultat = 'ECHEC' ORDER BY id DESC LIMIT 1");
        assertThat(echec.get("motif")).isEqualTo("AuditIndisponible");
    }

    @Test
    void si_un_evenement_de_securite_ne_peut_pas_s_ecrire_la_connexion_continue_et_l_erreur_est_comptee() {
        String s = Long.toHexString(System.nanoTime());
        userService.create(new UserCreateRequestDto("u" + s, s + "@exemple.test", "motdepasse-1", null, Set.of()));
        AuthentificationDeTest.deconnecter();
        double avant = registre.counter("rh.audit.ecriture.echec", "categorie", "SECURITE").count();
        doThrow(new IllegalStateException("base d'audit indisponible")).when(ecrivain).ecrireSeparement(any(AuditJournalEntry.class));

        IAuthService.Connexion connexion = authService.login("u" + s, "motdepasse-1");

        assertThat(connexion.reponse().accessToken()).as("la connexion n'est pas bloquée par une panne d'audit").isNotBlank();
        assertThat(registre.counter("rh.audit.ecriture.echec", "categorie", "SECURITE").count()).isEqualTo(avant + 1);
    }
}

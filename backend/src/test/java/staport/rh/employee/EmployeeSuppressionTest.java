package staport.rh.employee;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import staport.rh.audit.support.AuditIntegrationTestBase;
import staport.rh.audit.support.DonneesDeTest.Referentiel;
import staport.rh.auth.dtos.request.UserCreateRequestDto;
import staport.rh.auth.entities.Utilisateur;
import staport.rh.auth.security.JwtService;
import staport.rh.auth.services.interfaces.IUserService;

import java.time.YearMonth;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Un employé référencé par un bulletin ou par un compte utilisateur n'est pas supprimable : la base refuse, l'API répond un
 * {@code 409} explicite (et non un {@code 500}), l'employé est conservé. Sans dépendant, la suppression réussit.
 */
@AutoConfigureMockMvc
class EmployeeSuppressionTest extends AuditIntegrationTestBase {

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private JwtService jwtService;
    @Autowired
    private IUserService userService;

    private String jeton() {
        Utilisateur utilisateur = new Utilisateur();
        utilisateur.setId(UTILISATEUR_ID);
        utilisateur.setUsername(UTILISATEUR_NOM);
        return "Bearer " + jwtService.genererAccessToken(utilisateur, Set.of("EMPLOYEE_DELETE"), Set.of());
    }

    private long employes(long id) {
        return jdbc.queryForObject("SELECT count(*) FROM employe WHERE id = ?", Long.class, id);
    }

    @Test
    void un_employe_qui_a_un_bulletin_n_est_pas_supprimable() throws Exception {
        Referentiel ref = donnees.creerReferentiel();
        donnees.creerBulletin(ref, YearMonth.of(2092, 1));

        mockMvc.perform(delete("/employees/" + ref.employeId()).header("Authorization", jeton()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("bulletin de paie")))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("INACTIF")));

        assertThat(employes(ref.employeId())).as("l'employé est conservé").isEqualTo(1);
    }

    @Test
    void un_employe_lie_a_un_compte_n_est_pas_supprimable() throws Exception {
        Referentiel ref = donnees.creerReferentiel();
        userService.create(new UserCreateRequestDto("u" + ref.suffixe(), ref.suffixe() + "@exemple.test", "motdepasse-1", ref.employeId(), Set.of()));

        mockMvc.perform(delete("/employees/" + ref.employeId()).header("Authorization", jeton()))
                .andExpect(status().isConflict());

        assertThat(employes(ref.employeId())).isEqualTo(1);
    }

    @Test
    void un_employe_sans_dependant_se_supprime() throws Exception {
        Referentiel ref = donnees.creerReferentiel();

        mockMvc.perform(delete("/employees/" + ref.employeId()).header("Authorization", jeton()))
                .andExpect(status().isNoContent());

        assertThat(employes(ref.employeId())).isZero();
    }
}

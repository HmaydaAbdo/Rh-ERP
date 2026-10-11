package staport.rh.auth.security;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Endpoints de supervision (conventions/security.md, « Actuator ») : la santé et les métriques Prometheus sont publiques,
 * rien d'autre n'est exposé. Application complète (la configuration d'exposition vient de {@code application.yml}).
 */
@SpringBootTest
@AutoConfigureMockMvc
class SupervisionTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void la_sante_est_publique() throws Exception {
        mockMvc.perform(get("/actuator/health")).andExpect(status().isOk());
    }

    @Test
    void les_metriques_prometheus_sont_publiques_et_portent_le_nom_de_l_application() throws Exception {
        mockMvc.perform(get("/actuator/prometheus"))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("application=\"paie\"")));
    }

    @Test
    void les_autres_endpoints_de_supervision_exigent_une_authentification() throws Exception {
        mockMvc.perform(get("/actuator/env")).andExpect(status().isUnauthorized());
    }
}

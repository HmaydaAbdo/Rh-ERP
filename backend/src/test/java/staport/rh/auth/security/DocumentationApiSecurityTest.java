package staport.rh.auth.security;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import staport.rh.audit.metrics.AuditMetrics;
import staport.rh.audit.services.interfaces.IAuditJournalWriter;
import staport.rh.equipe.controller.EquipeController;
import staport.rh.equipe.services.interfaces.IEquipeService;
import staport.rh.parametre.services.interfaces.IParametreService;
import staport.rh.support.ParametresDeTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * La documentation d'API (Swagger) est éteinte par défaut, donc en production : ses routes exigent alors un jeton, comme
 * tout le reste (conventions/swagger.md). Pendant dans {@link DocumentationApiAllumeeSecurityTest}.
 */
@WebMvcTest(EquipeController.class)
@Import({SecurityConfig.class, JwtService.class})
@TestPropertySource(properties = {
        "security.jwt.secret=dGVzdC1zZWNyZXQtdGVzdC1zZWNyZXQtdGVzdC1zZWNyZXQtMTIzNDU2Nzg5MA==",
        "spring.application.name=paie-test"
})
class DocumentationApiSecurityTest {

    @TestConfiguration
    @EnableWebSecurity
    static class ActivationSecurite {

        /** Le service de jeton lit sa durée dans les paramètres ; la tranche web n'a pas la base. */
        @Bean
        IParametreService parametres() {
            return ParametresDeTest.parDefaut();
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private IEquipeService equipeService;

    @MockitoBean
    private IAuditJournalWriter auditJournalWriter;

    @MockitoBean
    private AuditMetrics auditMetrics;

    @Test
    void sans_connexion_la_documentation_est_refusee() throws Exception {
        for (String route : new String[]{"/v3/api-docs", "/swagger-ui/index.html", "/swagger-ui.html"}) {
            assertThat(mockMvc.perform(get(route)).andReturn().getResponse().getStatus())
                    .as("GET %s", route).isEqualTo(401);
        }
    }
}

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
import staport.rh.equipe.controller.EquipeController;
import staport.rh.equipe.services.interfaces.IEquipeService;
import staport.rh.parametre.services.interfaces.IParametreService;
import staport.rh.support.ParametresDeTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * Documentation d'API allumée (développement) : la sécurité ne la refuse plus sans connexion. Le reste de l'API, lui,
 * reste protégé (voir {@link JwtSecurityChainTest}).
 */
@WebMvcTest(EquipeController.class)
@Import({SecurityConfig.class, JwtService.class})
@TestPropertySource(properties = {
        "security.jwt.secret=dGVzdC1zZWNyZXQtdGVzdC1zZWNyZXQtdGVzdC1zZWNyZXQtMTIzNDU2Nzg5MA==",
        "spring.application.name=paie-test",
        "springdoc.api-docs.enabled=true"
})
class DocumentationApiAllumeeSecurityTest {

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

    @Test
    void sans_connexion_la_documentation_n_est_pas_refusee_par_la_securite() throws Exception {
        for (String route : new String[]{"/v3/api-docs", "/swagger-ui/index.html", "/swagger-ui.html"}) {
            assertThat(mockMvc.perform(get(route)).andReturn().getResponse().getStatus())
                    .as("GET %s", route).isNotIn(401, 403);
        }
    }

    @Test
    void le_reste_de_l_api_reste_protege() throws Exception {
        assertThat(mockMvc.perform(get("/equipes/1")).andReturn().getResponse().getStatus()).isEqualTo(401);
    }
}

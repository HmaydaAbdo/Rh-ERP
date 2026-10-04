package staport.rh.auth.security;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import staport.rh.auth.entities.Utilisateur;
import staport.rh.equipe.controller.EquipeController;
import staport.rh.equipe.dtos.response.EquipeResponseDto;
import staport.rh.equipe.services.interfaces.IEquipeService;

import java.util.List;
import java.util.Set;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Chaîne de sécurité complète, de bout en bout, avec de VRAIS Access Tokens émis par {@link JwtService}
 * (signature HS256, extraction des claims {@code permissions}/{@code roles} en autorités, contrôle
 * {@code @PreAuthorize}) — sans base de données. {@code EquipeController} sert de représentant : la
 * couverture de tous les endpoints est dans {@link EndpointSecurityTest}.
 */
@WebMvcTest(EquipeController.class)
@Import({SecurityConfig.class, JwtService.class})
@TestPropertySource(properties = {
        "security.jwt.secret=dGVzdC1zZWNyZXQtdGVzdC1zZWNyZXQtdGVzdC1zZWNyZXQtMTIzNDU2Nzg5MA==",
        "spring.application.name=paie-test"
})
class JwtSecurityChainTest {

    /** Le contexte de test restreint à la couche web n'active pas Spring Security web tout seul. */
    @TestConfiguration
    @EnableWebSecurity
    static class ActivationSecurite {
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @MockitoBean
    private IEquipeService equipeService;

    private String token(Set<String> permissions, Set<String> roles) {
        Utilisateur utilisateur = new Utilisateur();
        utilisateur.setId(1L);
        utilisateur.setUsername("test");
        return jwtService.genererAccessToken(utilisateur, permissions, roles);
    }

    @Test
    void sansTokenLaRequeteEstRefuseeEn401() throws Exception {
        mockMvc.perform(get("/equipes/1")).andExpect(status().isUnauthorized());
    }

    @Test
    void unTokenInvalideEstRefuseEn401() throws Exception {
        mockMvc.perform(get("/equipes/1").header("Authorization", "Bearer pas.un.jwt"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void unTokenSigneAvecUnAutreSecretEstRefuseEn401() throws Exception {
        JwtService autre = new JwtService("YXV0cmUtc2VjcmV0LWF1dHJlLXNlY3JldC1hdXRyZS1zZWNyZXQtMDAwMDAwMDA=", "paie-test");
        Utilisateur utilisateur = new Utilisateur();
        utilisateur.setId(1L);
        utilisateur.setUsername("pirate");
        String forge = autre.genererAccessToken(utilisateur, Set.of("EQUIPE_READ", "EQUIPE_DELETE"), Set.of("SYSTEM_ADMIN"));

        mockMvc.perform(get("/equipes/1").header("Authorization", "Bearer " + forge))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void unTokenSansLaPermissionRequiseEstRefuseEn403() throws Exception {
        String lectureSeule = token(Set.of("EQUIPE_READ"), Set.of("LECTEUR"));

        mockMvc.perform(post("/equipes").header("Authorization", "Bearer " + lectureSeule)
                        .contentType(APPLICATION_JSON).content("{\"code\":\"X\",\"libelle\":\"Y\"}"))
                .andExpect(status().isForbidden());
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/equipes/1")
                        .header("Authorization", "Bearer " + lectureSeule))
                .andExpect(status().isForbidden());
    }

    @Test
    void unTokenAvecLaPermissionRequiseEstAccepte() throws Exception {
        when(equipeService.findById(1L)).thenReturn(new EquipeResponseDto(1L, "CH", "CHAUFFEURS"));
        Page<EquipeResponseDto> page = new PageImpl<>(List.of());
        when(equipeService.search(any(), any())).thenReturn(page);

        String lecture = token(Set.of("EQUIPE_READ"), Set.of("LECTEUR"));

        mockMvc.perform(get("/equipes/1").header("Authorization", "Bearer " + lecture)).andExpect(status().isOk());
        mockMvc.perform(post("/equipes/search").header("Authorization", "Bearer " + lecture)
                        .contentType(APPLICATION_JSON).content("{}"))
                .andExpect(status().isOk());
    }

    @Test
    void unePageEstSerialiseeParUnDtoStable() throws Exception {
        when(equipeService.search(any(), any())).thenReturn(
                new PageImpl<>(List.of(new EquipeResponseDto(1L, "CH", "CHAUFFEURS")), org.springframework.data.domain.PageRequest.of(1, 1), 5));

        mockMvc.perform(post("/equipes/search").header("Authorization", "Bearer " + token(Set.of("EQUIPE_READ"), Set.of()))
                        .contentType(APPLICATION_JSON).content("{}"))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.content[0].code").value("CH"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.page.totalElements").value(5))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.page.totalPages").value(5))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.page.number").value(1))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.page.size").value(1))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.totalElements").doesNotExist());
    }

    @Test
    void uneRequeteMalFormeEstUneErreurDuClientPasDuServeur() throws Exception {
        String lecture = token(Set.of("EQUIPE_READ"), Set.of());

        mockMvc.perform(post("/equipes/search").header("Authorization", "Bearer " + lecture)
                        .contentType(APPLICATION_JSON).content("{ pas du json"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(get("/equipes/pas-un-nombre").header("Authorization", "Bearer " + lecture))
                .andExpect(status().isBadRequest());
    }

    @Test
    void unRoleSansLaPermissionNeDonnePasAcces() throws Exception {
        // Le nom d'un rôle devient une autorité (SecurityConfig) mais ne remplace jamais la permission.
        String adminSansPermission = token(Set.of(), Set.of("SYSTEM_ADMIN"));

        mockMvc.perform(get("/equipes/1").header("Authorization", "Bearer " + adminSansPermission))
                .andExpect(status().isForbidden());
    }
}

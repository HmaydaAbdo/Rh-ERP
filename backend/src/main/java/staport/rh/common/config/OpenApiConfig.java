package staport.rh.common.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    private static final String BEARER_AUTH = "bearerAuth";

    @Bean
    public OpenAPI openApi() {
        return new OpenAPI()
                .components(new Components()
                        .addSecuritySchemes(BEARER_AUTH, new SecurityScheme()
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")))
                // Appliqué globalement (pas par contrôleur) : tous les endpoints sont protégés par
                // défaut (SecurityConfig.anyRequest().authenticated()), Swagger UI doit donc
                // proposer le cadenas partout, sauf sur les endpoints publics (login/refresh/...).
                .addSecurityItem(new SecurityRequirement().addList(BEARER_AUTH));
    }
}

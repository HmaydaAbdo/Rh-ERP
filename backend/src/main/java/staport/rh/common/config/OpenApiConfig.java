package staport.rh.common.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.media.Content;
import io.swagger.v3.oas.models.media.MediaType;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.responses.ApiResponse;
import io.swagger.v3.oas.models.responses.ApiResponses;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springdoc.core.customizers.GlobalOpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.Set;

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

    @Bean
    public GlobalOpenApiCustomizer documentErrorResponseSchemas() {
        Set<String> errorStatuses = Set.of("400", "401", "404", "409");
        return openApi -> openApi.getPaths().forEach((pathName, path) -> path.readOperations().forEach(operation -> {
            ApiResponses responses = operation.getResponses();
            boolean publicAuthRefresh = pathName.equals("/auth/refresh");
            boolean bearerProtected = operation.getSecurity() == null;
            if (bearerProtected || publicAuthRefresh) {
                ajouterReponse(responses, "401", "Jeton Bearer absent, invalide ou expiré ; aucun corps n'est renvoyé.", false);
                ajouterReponse(responses, "403", publicAuthRefresh
                        ? "Origine absente ou non autorisée pour renouveler le cookie de session."
                        : "Jeton valide mais permission insuffisante ; aucun corps n'est renvoyé.", false);
            }
            boolean hasInputParameter = operation.getParameters() != null && operation.getParameters().stream()
                    .anyMatch(parameter -> "query".equals(parameter.getIn()) || "path".equals(parameter.getIn()));
            if (operation.getRequestBody() != null || hasInputParameter) {
                // Les imports renvoient aussi leur bilan métier en 400 ; leur oneOf est déclaré sur les contrôleurs.
                boolean importAvecRejetDeLignes = Set.of("/employees/import", "/functions/import", "/paie/import").contains(pathName);
                if (!importAvecRejetDeLignes) {
                    ajouterReponse(responses, "400", "Requête illisible, paramètre invalide ou données non conformes aux règles de validation.", true);
                }
            }
            if (pathName.contains("{id}")) {
                ajouterReponse(responses, "404", "La ressource identifiée par le chemin n'existe pas.", true);
            }
            ajouterReponse(responses, "500", "Erreur serveur inattendue ; le corps suit le schéma ErrorResponseDto.", true);

            responses.forEach((status, response) -> {
                boolean importResultWithValidationErrors = status.equals("400")
                        && Set.of("/employees/import", "/functions/import", "/paie/import").contains(pathName);
                if (errorStatuses.contains(status) && !importResultWithValidationErrors) {
                    appliquerSchemaErreur(response);
                }
            });
        }));
    }

    private static void ajouterReponse(ApiResponses responses, String status, String description, boolean avecCorps) {
        ApiResponse response = responses.computeIfAbsent(status, ignored -> new ApiResponse());
        if (response.getDescription() == null || response.getDescription().isBlank()
                || descriptionStatutParDefaut(status).equals(response.getDescription())) {
            response.setDescription(description);
        }
        if (avecCorps) {
            appliquerSchemaErreur(response);
        }
    }

    private static void appliquerSchemaErreur(ApiResponse response) {
        response.setContent(new Content().addMediaType("application/json",
                new MediaType().schema(new Schema<>().$ref("#/components/schemas/ErrorResponseDto"))));
    }

    private static String descriptionStatutParDefaut(String status) {
        return switch (status) {
            case "400" -> "Bad Request";
            case "401" -> "Unauthorized";
            case "403" -> "Forbidden";
            case "404" -> "Not Found";
            case "409" -> "Conflict";
            case "500" -> "Internal Server Error";
            default -> "";
        };
    }
}

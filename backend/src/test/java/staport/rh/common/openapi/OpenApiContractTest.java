package staport.rh.common.openapi;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.swagger.parser.OpenAPIParser;
import io.swagger.v3.parser.core.models.ParseOptions;
import io.swagger.v3.parser.core.models.SwaggerParseResult;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Iterator;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "springdoc.api-docs.enabled=true",
        "springdoc.swagger-ui.enabled=true",
        "spring.datasource.url=jdbc:postgresql://${DB_HOST}:${DB_PORT}/${DB_NAME}",
        "spring.datasource.username=${DB_USER}",
        "spring.datasource.password=${DB_PASSWORD}",
        "spring.flyway.user=${DB_MIGRATION_USER}",
        "spring.flyway.password=${DB_MIGRATION_PASSWORD}",
        "security.jwt.secret=Y2ktdGVzdC1zZWNyZXQtbmV2ZXItdXNlLWluLXByb2Q9MTIzNA==",
        "security.jwt.frontend-url=http://localhost:4200",
        "security.cors.allowed-origins=http://localhost:4200",
        "security.cookie.secure=false",
        "chantier-sync.base-url=http://example.invalid/webServiceBS/getChantiers",
        "spring.mail.host=localhost",
        "spring.mail.port=1025",
        "spring.mail.username=",
        "spring.mail.password=",
        "spring.mail.properties.mail.smtp.auth=false",
        "spring.mail.properties.mail.smtp.starttls.enable=false",
        "security.admin.username=ci-admin",
        "security.admin.email=ci-admin@example.invalid",
        "security.admin.password=ci-admin-password",
        "spring.mail.from=noreply@example.invalid"
})
class OpenApiContractTest {

    private static final Set<String> HTTP_METHODS = Set.of("get", "post", "put", "patch", "delete", "head", "options");

    @Autowired
    private MockMvc mockMvc;

    @Test
    void la_specification_generee_est_complete_et_reste_coherente_avec_la_securite_et_les_fichiers() throws Exception {
        String json = mockMvc.perform(get("/v3/api-docs"))
                .andReturn()
                .getResponse()
                .getContentAsString();
        SwaggerParseResult validation = new OpenAPIParser().readContents(json, null, new ParseOptions());
        assertThat(validation.getOpenAPI()).as("OpenAPI 3.1 parser result").isNotNull();
        assertThat(validation.getMessages()).as("OpenAPI validation diagnostics").isEmpty();
        JsonNode specification = new ObjectMapper().readTree(json);

        assertThat(specification.path("openapi").asText()).startsWith("3.");
        assertThat(specification.path("info").path("title").asText()).isNotBlank();
        assertThat(specification.path("paths").size()).isPositive();
        Set<String> tagNames = new HashSet<>();
        specification.path("tags").forEach(tag -> assertThat(tagNames.add(tag.path("name").asText()))
                .as("unique tag name %s", tag.path("name").asText()).isTrue());

        Set<String> operationIds = new HashSet<>();
        Iterator<Map.Entry<String, JsonNode>> paths = specification.path("paths").fields();
        while (paths.hasNext()) {
            Map.Entry<String, JsonNode> path = paths.next();
            Iterator<Map.Entry<String, JsonNode>> operations = path.getValue().fields();
            while (operations.hasNext()) {
                Map.Entry<String, JsonNode> entry = operations.next();
                if (!HTTP_METHODS.contains(entry.getKey())) {
                    continue;
                }

                JsonNode operation = entry.getValue();
                assertThat(operation.path("operationId").asText())
                        .as("operationId for %s %s", entry.getKey(), path.getKey()).isNotBlank();
                assertThat(operationIds.add(operation.path("operationId").asText()))
                        .as("unique operationId for %s %s", entry.getKey(), path.getKey()).isTrue();
                assertThat(operation.path("summary").asText())
                        .as("summary for %s %s", entry.getKey(), path.getKey()).isNotBlank();
                assertThat(operation.path("responses").isEmpty())
                        .as("responses for %s %s", entry.getKey(), path.getKey()).isFalse();

                Iterator<Map.Entry<String, JsonNode>> responses = operation.path("responses").fields();
                while (responses.hasNext()) {
                    Map.Entry<String, JsonNode> response = responses.next();
                    assertThat(response.getValue().path("description").asText())
                            .as("description for %s %s response %s", entry.getKey(), path.getKey(), response.getKey())
                            .isNotBlank();
                }
            }
        }

        assertThat(specification.path("components").path("schemas").path("ErrorResponseDto").path("properties").fieldNames())
                .toIterable()
                .contains("timestamp", "status", "error", "message", "path");

        assertThat(specification.path("paths").path("/auth/login").path("post").path("security")).isEmpty();
        assertThat(specification.path("paths").path("/auth/refresh").path("post").path("security")).isEmpty();
        assertThat(specification.path("paths").path("/auth/forgot-password").path("post").path("security")).isEmpty();
        assertThat(specification.path("paths").path("/auth/reset-password").path("post").path("security")).isEmpty();
        assertThat(specification.path("paths").path("/auth/password-policy").path("get").path("security")).isEmpty();
        assertThat(specification.path("paths").path("/auth/refresh").path("post").path("responses").path("403").path("description").asText())
                .contains("Origine");

        assertFileUpload(specification, "/employees/import");
        assertFileUpload(specification, "/functions/import");
        assertFileUpload(specification, "/paie/import");
        assertBinaryResponse(specification, "/employees/import/modele", "get", "200",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        assertBinaryResponse(specification, "/functions/import/modele", "get", "200",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        assertBinaryResponse(specification, "/paie/import/modele", "get", "200",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

        assertBinaryResponse(specification, "/paie/export", "post", "200",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        assertBinaryResponse(specification, "/paie/report/pdf", "post", "200", "application/pdf");

        assertErrorResponse(specification, "/employees/import", "post", "400");
        assertErrorResponse(specification, "/functions/import", "post", "400");
        assertErrorResponse(specification, "/paie/import", "post", "400");
        assertThat(specification.path("paths").path("/employees/import").path("post").path("responses").path("400").toString())
                .contains("EmployeeImportResultDto");
        assertThat(specification.path("paths").path("/functions/import").path("post").path("responses").path("400").toString())
                .contains("FunctionImportResultDto");
        assertThat(specification.path("paths").path("/paie/import").path("post").path("responses").path("400").toString())
                .contains("PaieImportResultDto");
        assertErrorResponse(specification, "/paie/export", "post", "400");
        assertErrorResponse(specification, "/paie/report/pdf", "post", "400");
        assertErrorResponseSchemas(specification);
        assertSecurityAndServerErrorResponses(specification);
        assertAllReferencesResolve(specification, specification);
    }

    private static void assertFileUpload(JsonNode specification, String path) {
        JsonNode operation = specification.path("paths").path(path).path("post");
        JsonNode file = operation.path("requestBody").path("content").path("multipart/form-data")
                .path("schema").path("properties").path("file");
        assertThat(file.path("type").asText()).as("file field type for %s", path).isEqualTo("string");
        assertThat(file.path("format").asText()).as("file field format for %s", path).isEqualTo("binary");
        assertThat(operation.toString()).contains("20 Mo");
    }

    private static void assertBinaryResponse(JsonNode specification, String path, String method,
                                             String status, String mediaType) {
        JsonNode schema = specification.path("paths").path(path).path(method).path("responses").path(status)
                .path("content").path(mediaType).path("schema");
        assertThat(schema.path("type").asText()).as("binary type for %s %s", method, path).isEqualTo("string");
        assertThat(schema.path("format").asText()).as("binary format for %s %s", method, path).isEqualTo("binary");
    }

    private static void assertErrorResponse(JsonNode specification, String path, String method, String status) {
        JsonNode schema = specification.path("paths").path(path).path(method).path("responses").path(status)
                .path("content").path("application/json").path("schema");
        assertThat(schema.toString()).contains("ErrorResponseDto");
    }

    private static void assertErrorResponseSchemas(JsonNode specification) {
        Set<String> documentedErrorStatuses = Set.of("400", "401", "404", "409");
        specification.path("paths").fields().forEachRemaining(path ->
                path.getValue().fields().forEachRemaining(method -> {
                    if (!HTTP_METHODS.contains(method.getKey())) {
                        return;
                    }
                    method.getValue().path("responses").fields().forEachRemaining(response -> {
                        if (documentedErrorStatuses.contains(response.getKey())) {
                            assertThat(response.getValue().path("content").path("application/json").path("schema").toString())
                                    .as("ErrorResponseDto schema for %s %s response %s", method.getKey(), path.getKey(), response.getKey())
                                    .contains("ErrorResponseDto");
                        }
                    });
                }));
    }

    private static void assertSecurityAndServerErrorResponses(JsonNode specification) {
        specification.path("paths").fields().forEachRemaining(path ->
                path.getValue().fields().forEachRemaining(method -> {
                    if (!HTTP_METHODS.contains(method.getKey())) {
                        return;
                    }
                    JsonNode operation = method.getValue();
                    JsonNode responses = operation.path("responses");
                    assertThat(responses.path("500").path("description").asText())
                            .as("500 description for %s %s", method.getKey(), path.getKey()).isNotBlank();
                    assertThat(responses.path("500").path("content").path("application/json").path("schema").toString())
                            .as("500 ErrorResponseDto for %s %s", method.getKey(), path.getKey()).contains("ErrorResponseDto");

                    boolean bearerProtected = !operation.has("security") || !operation.path("security").isEmpty();
                    if (bearerProtected) {
                        assertThat(responses.path("401").path("description").asText())
                                .as("401 description for %s %s", method.getKey(), path.getKey()).isNotBlank();
                        assertThat(responses.path("403").path("description").asText())
                                .as("403 description for %s %s", method.getKey(), path.getKey()).isNotBlank();
                    }
                    boolean hasInputParameter = false;
                    for (JsonNode parameter : operation.path("parameters")) {
                        hasInputParameter |= Set.of("query", "path").contains(parameter.path("in").asText());
                    }
                    if (operation.has("requestBody") || hasInputParameter) {
                        assertThat(responses.path("400").path("description").asText())
                                .as("400 description for %s %s", method.getKey(), path.getKey()).isNotBlank();
                        assertThat(responses.path("400").path("content").path("application/json").path("schema").toString())
                                .as("400 schema for %s %s", method.getKey(), path.getKey()).contains("ErrorResponseDto");
                    }
                }));
    }

    private static void assertAllReferencesResolve(JsonNode node, JsonNode specification) {
        if (node.isObject()) {
            JsonNode reference = node.get("$ref");
            if (reference != null && reference.isTextual() && reference.asText().startsWith("#/")) {
                String pointer = reference.asText().substring(1);
                assertThat(specification.at(pointer).isMissingNode())
                        .as("OpenAPI reference %s resolves", reference.asText()).isFalse();
            }
            node.elements().forEachRemaining(child -> assertAllReferencesResolve(child, specification));
        } else if (node.isArray()) {
            node.elements().forEachRemaining(child -> assertAllReferencesResolve(child, specification));
        }
    }
}

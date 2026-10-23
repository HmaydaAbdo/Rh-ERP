package staport.rh.compatibility;

import io.modelcontextprotocol.json.McpJsonMapper;
import io.modelcontextprotocol.json.jackson3.JacksonMcpJsonMapper;
import io.modelcontextprotocol.server.McpServer;
import io.modelcontextprotocol.server.McpSyncServer;
import io.modelcontextprotocol.server.transport.HttpServletStreamableServerTransportProvider;
import io.modelcontextprotocol.spec.McpSchema;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.boot.tomcat.servlet.TomcatServletWebServerFactory;
import org.springframework.boot.web.server.servlet.context.AnnotationConfigServletWebServerApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.DependsOn;
import tools.jackson.databind.json.JsonMapper;

import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * P1.1 : interopérabilité réseau réelle Java/TypeScript sur le classpath ERP-RH.
 * Profil explicite, sans SpringApplication, scan applicatif, auto-configuration, .env ou base.
 * Le serveur est limité à loopback, à un port éphémère et à la durée de ce test synthétique.
 */
class McpCompatibilityTest {

    @Test
    @Timeout(90)
    void un_client_typescript_decouvre_et_appelle_le_sdk_java_puis_ferme_sa_session() throws Exception {
        Path clientDirectory = Path.of("..", "scripts", "ia", "mcp-compatibility").toAbsolutePath().normalize();
        assertThat(clientDirectory.resolve("node_modules/@modelcontextprotocol/sdk/package.json"))
                .as("Installer le client isolé avec npm ci avant le test Maven")
                .exists();
        Path report = Path.of("target", "mcp-compatibility", "client.tap").toAbsolutePath();
        Files.createDirectories(report.getParent());
        int port;

        try (var context = new AnnotationConfigServletWebServerApplicationContext()) {
            context.register(ServeurSynthetique.class);
            context.refresh();
            port = context.getWebServer().getPort();
            assertThat(port).isPositive().isNotIn(4200, 4300, 5000, 5001, 5002, 8080);
            assertThat(context.getBeanNamesForType(javax.sql.DataSource.class)).isEmpty();
            assertThat(context.getBeanDefinitionNames()).noneMatch(name -> name.contains("flyway"));

            var processBuilder = new ProcessBuilder(System.getProperty("node.executable", "node"),
                    "--test", "--test-reporter=tap", "src/interop.test.ts")
                    .directory(clientDirectory.toFile())
                    .redirectErrorStream(true)
                    .redirectOutput(report.toFile());
            processBuilder.environment().put("MCP_COMPATIBILITY_URL", "http://127.0.0.1:" + port + "/mcp");
            Process process = processBuilder.start();
            try {
                assertThat(process.waitFor(45, TimeUnit.SECONDS))
                        .as("Le client doit se terminer dans les 45 secondes ; rapport : %s", report)
                        .isTrue();
                assertThat(process.exitValue()).as("Résultats TypeScript :\n%s", Files.readString(report)).isZero();
            } finally {
                if (process.isAlive()) {
                    process.destroyForcibly();
                    assertThat(process.waitFor(5, TimeUnit.SECONDS)).as("Fermeture du client Node").isTrue();
                }
            }
        }

        assertThatThrownBy(() -> {
            try (var socket = new Socket()) {
                socket.connect(new InetSocketAddress("127.0.0.1", port), 1_000);
            }
        }).as("Le serveur de test doit libérer son port").isInstanceOf(java.io.IOException.class);
    }

    @Configuration(proxyBeanMethods = false)
    static class ServeurSynthetique {

        @Bean
        McpJsonMapper mcpJsonMapper() {
            return new JacksonMcpJsonMapper(JsonMapper.builder().build());
        }

        @Bean
        HttpServletStreamableServerTransportProvider transport(McpJsonMapper mapper) {
            return HttpServletStreamableServerTransportProvider.builder()
                    .jsonMapper(mapper)
                    .mcpEndpoint("/mcp")
                    .maxRequestSize(4_096)
                    .keepAliveInterval(Duration.ofSeconds(10))
                    .build();
        }

        @Bean(destroyMethod = "close")
        McpSyncServer mcpServer(HttpServletStreamableServerTransportProvider transport) {
            Map<String, Object> inputSchema = Map.of("type", "object", "properties",
                    Map.of("message", Map.of("type", "string", "minLength", 1, "maxLength", 80)),
                    "required", List.of("message"), "additionalProperties", false);
            Map<String, Object> outputSchema = Map.of("type", "object", "properties", Map.of(
                    "message", Map.of("type", "string"), "synthetic", Map.of("type", "boolean")),
                    "required", List.of("message", "synthetic"), "additionalProperties", false);
            var tool = McpSchema.Tool.builder("compat_echo", inputSchema)
                    .description("Test synthétique de sérialisation, sans accès aux domaines ERP-RH")
                    .outputSchema(outputSchema).build();
            return McpServer.sync(transport).serverInfo("erp-rh-compatibility", "P1.1")
                    .capabilities(McpSchema.ServerCapabilities.builder().tools(false).build())
                    .immediateExecution(true)
                    .toolCall(tool, (exchange, request) -> {
                        // Le SDK valide le schéma avant le handler ; les négatifs le vérifient sur le réseau.
                        String message = (String) request.arguments().get("message");
                        return McpSchema.CallToolResult.builder().isError(false)
                                .structuredContent(Map.of("message", message, "synthetic", true))
                                .addTextContent(message).build();
                    }).build();
        }

        @Bean
        @DependsOn("mcpServer")
        TomcatServletWebServerFactory webServerFactory(HttpServletStreamableServerTransportProvider transport)
                throws java.net.UnknownHostException {
            var factory = new TomcatServletWebServerFactory(0);
            factory.setAddress(InetAddress.getByName("127.0.0.1"));
            factory.addInitializers(servletContext -> {
                var registration = servletContext.addServlet("mcp-compatibility", transport);
                registration.setAsyncSupported(true);
                registration.addMapping("/mcp");
            });
            return factory;
        }
    }
}

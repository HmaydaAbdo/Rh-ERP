package staport.rh.mcp.config;

import io.modelcontextprotocol.common.McpTransportContext;
import io.modelcontextprotocol.json.McpJsonMapper;
import io.modelcontextprotocol.json.jackson3.JacksonMcpJsonMapper;
import io.modelcontextprotocol.server.McpServer;
import io.modelcontextprotocol.server.McpStatelessSyncServer;
import io.modelcontextprotocol.server.transport.HttpServletStatelessServerTransport;
import io.modelcontextprotocol.spec.McpSchema;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.boot.web.servlet.ServletRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import staport.rh.mcp.outils.OutilIdentite;
import tools.jackson.databind.json.JsonMapper;

import java.util.HashMap;
import java.util.Map;

/**
 * Serveur MCP d'ERP-RH (docs/ia.md, § 3) : transport Streamable HTTP <strong>sans état</strong> sur {@code /mcp} —
 * chaque requête est authentifiée par {@code McpSecurityConfig}, aucun identifiant de session ne peut être détourné.
 * Le catalogue est explicite : un outil n'est publié que s'il est déclaré ici. Désactivé sans {@code MCP_ENABLED=true}.
 */
@Configuration
@ConditionalOnBooleanProperty("security.mcp.enabled")
public class McpServeurConfig {

    /** Clé du contexte de transport qui porte l'authentification de la requête HTTP. */
    public static final String CONTEXTE_AUTHENTIFICATION = "erp-rh.authentification";
    static final String CHEMIN = "/mcp";
    private static final int TAILLE_MAXIMALE_REQUETE = 64 * 1024;

    @Bean
    OutilIdentite outilIdentite() {
        return new OutilIdentite();
    }

    @Bean
    HttpServletStatelessServerTransport mcpTransport() {
        McpJsonMapper json = new JacksonMcpJsonMapper(JsonMapper.builder().build());
        return HttpServletStatelessServerTransport.builder()
                .jsonMapper(json)
                .messageEndpoint(CHEMIN)
                .maxRequestSize(TAILLE_MAXIMALE_REQUETE)
                // Extraite sur le fil de la requête, après la chaîne de sécurité : l'outil ne dépend pas du fil d'exécution.
                .contextExtractor(requete -> {
                    Map<String, Object> contexte = new HashMap<>();
                    Authentication authentification = SecurityContextHolder.getContext().getAuthentication();
                    if (authentification != null) {
                        contexte.put(CONTEXTE_AUTHENTIFICATION, authentification);
                    }
                    return McpTransportContext.create(contexte);
                })
                .build();
    }

    @Bean(destroyMethod = "close")
    McpStatelessSyncServer mcpServeur(HttpServletStatelessServerTransport transport, OutilIdentite identite) {
        return McpServer.sync(transport)
                .serverInfo("erp-rh", "1")
                .capabilities(McpSchema.ServerCapabilities.builder().tools(false).build())
                .immediateExecution(true)
                .tools(identite.specification())
                .build();
    }

    @Bean
    ServletRegistrationBean<HttpServletStatelessServerTransport> mcpServlet(HttpServletStatelessServerTransport transport,
                                                                            McpStatelessSyncServer serveur) {
        // Le serveur est construit avant l'enregistrement : le transport a déjà son gestionnaire de messages.
        ServletRegistrationBean<HttpServletStatelessServerTransport> enregistrement =
                new ServletRegistrationBean<>(transport, CHEMIN);
        enregistrement.setName("mcp");
        enregistrement.setAsyncSupported(true);
        return enregistrement;
    }
}

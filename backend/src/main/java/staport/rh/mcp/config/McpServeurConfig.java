package staport.rh.mcp.config;

import org.springframework.ai.mcp.customizer.McpStatelessSyncServerCustomizer;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Serveur MCP d'ERP-RH (docs/ia.md, § 3 et T13) : transport Streamable HTTP <strong>sans état</strong> sur {@code /mcp},
 * fourni par Spring AI ({@code spring.ai.mcp.server.*} dans {@code application.yml}). Chaque requête est authentifiée
 * par {@code McpSecurityConfig} ; les outils sont les méthodes {@code @McpTool} des composants de ce module, aucun
 * n'est publié autrement. Désactivé sans {@code MCP_ENABLED=true}.
 */
@Configuration
@ConditionalOnBooleanProperty("security.mcp.enabled")
public class McpServeurConfig {

    /**
     * L'outil s'exécute sur le fil de la requête HTTP, après la chaîne de sécurité : {@code @PreAuthorize}, l'audit et
     * les façades de domaine retrouvent l'identité de l'appelant dans le contexte de sécurité, sans changer de fil.
     */
    @Bean
    McpStatelessSyncServerCustomizer executionSurLeFilDeLaRequete() {
        return specification -> specification.immediateExecution(true);
    }
}

package staport.rh.mcp.outils;

import io.modelcontextprotocol.common.McpTransportContext;
import io.modelcontextprotocol.server.McpStatelessServerFeatures;
import io.modelcontextprotocol.spec.McpSchema;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import staport.rh.mcp.config.McpServeurConfig;

import java.util.List;
import java.util.Map;

/**
 * Outil {@code systeme_identite} : l'identité et les autorités que Spring a reconstruites pour cet appel, depuis le
 * jeton agent puis la base. Il n'a aucun argument : l'identité ne vient jamais d'une valeur fournie par le modèle.
 */
public class OutilIdentite {

    static final String NOM = "systeme_identite";

    public McpStatelessServerFeatures.SyncToolSpecification specification() {
        Map<String, Object> entree = Map.of("type", "object", "properties", Map.of(), "additionalProperties", false);
        Map<String, Object> sortie = Map.of("type", "object",
                "properties", Map.of(
                        "utilisateur", Map.of("type", "string"),
                        "autorites", Map.of("type", "array", "items", Map.of("type", "string"))),
                "required", List.of("utilisateur", "autorites"),
                "additionalProperties", false);
        McpSchema.Tool outil = McpSchema.Tool.builder(NOM, entree)
                .description("Identité et droits effectifs de l'utilisateur pour qui l'assistant agit")
                .outputSchema(sortie)
                .build();
        return new McpStatelessServerFeatures.SyncToolSpecification(outil, (contexte, requete) -> appeler(contexte));
    }

    private static McpSchema.CallToolResult appeler(McpTransportContext contexte) {
        if (!(contexte.get(McpServeurConfig.CONTEXTE_AUTHENTIFICATION) instanceof Authentication authentification)) {
            return McpSchema.CallToolResult.builder().isError(true).addTextContent("Identité indisponible").build();
        }
        List<String> autorites = authentification.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .sorted()
                .toList();
        return McpSchema.CallToolResult.builder()
                .isError(false)
                .structuredContent(Map.of("utilisateur", authentification.getName(), "autorites", autorites))
                .addTextContent("Utilisateur : " + authentification.getName())
                .build();
    }
}

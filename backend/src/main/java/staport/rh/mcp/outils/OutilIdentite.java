package staport.rh.mcp.outils;

import org.springframework.ai.mcp.annotation.McpTool;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Outil {@code systeme_identite} : l'identité et les autorités que Spring a reconstruites pour cet appel, depuis le
 * jeton agent puis la base. Il n'a aucun argument : l'identité ne vient jamais d'une valeur fournie par le modèle.
 */
@Component
@ConditionalOnBooleanProperty("security.mcp.enabled")
public class OutilIdentite {

    @McpTool(name = "systeme_identite", title = "Identité et droits de l'utilisateur", generateOutputSchema = true,
            description = """
                    Rend l'identité de l'utilisateur pour qui tu agis et la liste complète de ses droits (permissions et rôles). \
                    À appeler quand la question porte sur ce que l'utilisateur peut faire ou voir, ou pour comprendre un refus \
                    « Access Denied » : il indique alors quelle permission manque.""",
            annotations = @McpTool.McpAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true,
                    openWorldHint = false))
    public Map<String, Object> identite() {
        Authentication authentification = SecurityContextHolder.getContext().getAuthentication();
        List<String> autorites = authentification.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .sorted()
                .toList();
        Map<String, Object> donnees = new LinkedHashMap<>();
        donnees.put("utilisateur", authentification.getName());
        donnees.put("autorites", autorites);
        return donnees;
    }
}

package staport.rh.mcp.outils;

import org.springframework.stereotype.Component;
import staport.rh.audit.perimetre.DescriptionPerimetre;
import staport.rh.audit.perimetre.PerimetreAudit;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Périmètre d'audit de tous les outils MCP de lecture (conventions/audit.md) : le canal, puis les paramètres de la vue
 * que l'outil propose (période, chantiers, équipes, fonctions, filtres), qui sont exactement le périmètre demandé ; le
 * volume est celui de la première liste rendue. L'outil lui-même est identifié par le code d'action de son entrée.
 */
@Component
public class PerimetreLectureMcp implements PerimetreAudit {

    @Override
    public DescriptionPerimetre decrire(Object[] arguments, Object resultat) {
        Map<String, Object> perimetre = new LinkedHashMap<>();
        perimetre.put("canal", "MCP");
        if (!(resultat instanceof Map<?, ?> donnees)) {
            return DescriptionPerimetre.de(perimetre, null);
        }
        if (donnees.get("vue") instanceof Map<?, ?> vue && vue.get("parametres") instanceof Map<?, ?> parametres) {
            parametres.forEach((cle, valeur) -> perimetre.put(String.valueOf(cle), valeur));
        }
        int elements = donnees.values().stream()
                .filter(java.util.Collection.class::isInstance)
                .map(valeur -> ((java.util.Collection<?>) valeur).size())
                .findFirst().orElse(1);
        return DescriptionPerimetre.de(perimetre, elements);
    }
}

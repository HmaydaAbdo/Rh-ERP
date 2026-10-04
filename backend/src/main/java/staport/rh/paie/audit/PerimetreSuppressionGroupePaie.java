package staport.rh.paie.audit;

import org.springframework.stereotype.Component;
import staport.rh.audit.perimetre.DescriptionPerimetre;
import staport.rh.audit.perimetre.PerimetreAudit;
import staport.rh.paie.dtos.request.PaieSearchCriteria;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Périmètre d'une suppression en groupe : les critères du groupe (mois, chantiers, équipes, fonctions, filtres de
 * texte) et le nombre que l'utilisateur a confirmé ; le nombre supprimé est celui du résultat. Le contenu de chaque
 * bulletin supprimé est dans les instantanés de la révision, pas ici.
 */
@Component
public class PerimetreSuppressionGroupePaie implements PerimetreAudit {

    @Override
    public DescriptionPerimetre decrire(Object[] arguments, Object resultat) {
        Map<String, Object> perimetre = new LinkedHashMap<>();
        if (arguments[0] instanceof PaieSearchCriteria criteres) {
            perimetre.put("periode", criteres.periode() != null ? criteres.periode().toString() : null);
            ajouterSiPresent(perimetre, "chantierIds", criteres.chantierIds());
            ajouterSiPresent(perimetre, "equipeIds", criteres.equipeIds());
            ajouterSiPresent(perimetre, "fonctionIds", criteres.fonctionIds());
            ajouterSiPresent(perimetre, "nomPrenom", criteres.nomPrenom());
            ajouterSiPresent(perimetre, "cin", criteres.cin());
        }
        perimetre.put("nombreConfirme", arguments[1]);
        return DescriptionPerimetre.de(perimetre, resultat instanceof Number nombre ? nombre.intValue() : null);
    }

    private static void ajouterSiPresent(Map<String, Object> perimetre, String cle, Object valeur) {
        boolean vide = valeur == null
                || (valeur instanceof Collection<?> collection && collection.isEmpty())
                || (valeur instanceof String texte && texte.isBlank());
        if (!vide) {
            perimetre.put(cle, valeur);
        }
    }
}

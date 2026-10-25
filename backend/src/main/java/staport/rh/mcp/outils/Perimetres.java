package staport.rh.mcp.outils;

import java.time.YearMonth;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/** Périmètre d'un appel : paramètres d'URL des vues partagées et valeurs bornées pour le journal d'audit. */
final class Perimetres {

    private Perimetres() {
    }

    /** {@code chantierIds}, {@code equipeIds}, {@code fonctionIds} au format des URL ({@code 3,7}) ; absents si vides. */
    static Map<String, String> parametresUrl(List<Long> chantiers, List<Long> equipes, List<Long> fonctions) {
        Map<String, String> parametres = new LinkedHashMap<>();
        ajouter(parametres, "chantierIds", chantiers);
        ajouter(parametres, "equipeIds", equipes);
        ajouter(parametres, "fonctionIds", fonctions);
        return parametres;
    }

    static Map<String, Object> de(YearMonth periode, List<Long> chantiers, List<Long> equipes, List<Long> fonctions) {
        Map<String, Object> perimetre = new LinkedHashMap<>();
        if (periode != null) {
            perimetre.put("periode", periode.toString());
        }
        if (chantiers != null) {
            perimetre.put("chantierIds", chantiers);
        }
        if (equipes != null) {
            perimetre.put("equipeIds", equipes);
        }
        if (fonctions != null) {
            perimetre.put("fonctionIds", fonctions);
        }
        return perimetre;
    }

    private static void ajouter(Map<String, String> parametres, String cle, List<Long> ids) {
        if (ids != null && !ids.isEmpty()) {
            parametres.put(cle, ids.stream().map(String::valueOf).collect(Collectors.joining(",")));
        }
    }
}

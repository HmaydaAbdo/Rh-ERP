package staport.rh.paie.report;

import java.util.List;

/** Une carte KPI (label + une ou plusieurs lignes de valeur) — utilisée aux 3 niveaux du rapport (global/chantier/
 * équipe, voir {@link RapportPageModelBuilder}) et traduite en HTML par {@link PaieReportHtmlBuilder}. Chaque ligne
 * de {@code valeurs} passe à la ligne si elle dépasse la largeur de la carte. {@code classeValeur} ("compte" ou
 * "montant") pilote la taille de police des valeurs en CSS (voir rapport.css). Type de données pur, jamais un
 * élément jsoup — {@link RapportPageModelBuilder} ne dépend d'aucune API HTML/PDF. */
record CarteKpi(String label, List<String> valeurs, String classeValeur) {

    CarteKpi(String label, String valeur, String classeValeur) {
        this(label, List.of(valeur), classeValeur);
    }
}

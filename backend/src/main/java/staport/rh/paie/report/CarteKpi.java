package staport.rh.paie.report;

/** Une carte KPI (label + valeur) — utilisée aux 3 niveaux du rapport (global/chantier/équipe, voir
 * {@link RapportPageModelBuilder}) et traduite en HTML par {@link PaieReportHtmlBuilder}. La valeur passe à la ligne
 * si elle dépasse la largeur de la carte. {@code classeValeur} ("compte" ou "montant") pilote la taille de police de
 * la valeur en CSS (voir rapport.css). Type de données pur, jamais un élément jsoup — {@link RapportPageModelBuilder}
 * ne dépend d'aucune API HTML/PDF. */
record CarteKpi(String label, String valeur, String classeValeur, String sousTexte) {

    CarteKpi(String label, String valeur, String classeValeur) {
        this(label, valeur, classeValeur, null);
    }
}

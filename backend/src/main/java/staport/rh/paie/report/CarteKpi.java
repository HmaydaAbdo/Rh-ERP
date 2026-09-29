package staport.rh.paie.report;

/** Une carte KPI (label + valeur) — utilisée aux 3 niveaux du rapport (global/chantier/équipe, voir
 * {@link RapportPageModelBuilder}) et traduite en HTML par {@link PaieReportHtmlBuilder}.
 * {@code classeValeur} optionnel ("compte"/"montant", pilote la taille de police en CSS —
 * {@code null} pour la taille par défaut du niveau global, voir rapport.css). Type de données pur,
 * jamais un élément jsoup — {@link RapportPageModelBuilder} ne dépend d'aucune API HTML/PDF. */
record CarteKpi(String label, String valeur, String classeValeur) {
    static CarteKpi de(String label, String valeur) {
        return new CarteKpi(label, valeur, null);
    }
}

package staport.rh.paie.report;

/** KPI d'effectif (headcount) avec comparaison au mois précédent — 0 est une valeur légitime. Une comparaison
 * indisponible (aucune ligne de paie le mois précédent) est distincte d'une variation réelle égale à zéro. */
record KpiEffectifVue(
        int effectifCourant,
        int effectifPrecedent,
        int variation,
        boolean comparaisonDisponible
) {

    KpiEffectifVue(int effectifCourant, int effectifPrecedent, int variation) {
        this(effectifCourant, effectifPrecedent, variation, true);
    }
}

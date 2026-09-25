package staport.rh.paie.report;

/** KPI d'effectif (headcount) avec comparaison au mois précédent — 0 est une valeur légitime
 * (contrairement à un montant, un effectif de 0 n'est jamais ambigu avec "aucune donnée"). */
record KpiEffectifVue(
        int effectifCourant,
        int effectifPrecedent,
        String variation
) {
}

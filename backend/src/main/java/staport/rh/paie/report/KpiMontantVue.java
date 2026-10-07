package staport.rh.paie.report;

/**
 * KPI financier avec le montant du mois précédent — {@code valeurPrecedente} est {@code null} quand aucun
 * bulletin n'existe pour le mois précédent sur ce périmètre (distinct d'un montant réellement nul), voir
 * {@code PaieReportNumberFormat.masseOuNull}. Le rapport n'affiche aucune variation : les deux montants
 * sont présentés côte à côte, dans deux cartes.
 */
record KpiMontantVue(
        String valeurCourante,
        String valeurPrecedente
) {
}

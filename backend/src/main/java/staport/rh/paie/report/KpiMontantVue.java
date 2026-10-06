package staport.rh.paie.report;

/**
 * KPI financier avec comparaison au mois précédent — {@code valeurPrecedente} et les deux variations sont
 * {@code null} quand aucun bulletin n'existe pour le mois précédent sur ce périmètre (distinct d'une variation
 * réellement nulle) ; {@code variationPourcent} est aussi {@code null} quand le montant précédent est nul (division
 * impossible). Voir {@code PaieReportNumberFormat}.
 */
record KpiMontantVue(
        String valeurCourante,
        String valeurPrecedente,
        String variationAbsolue,
        String variationPourcent
) {
}

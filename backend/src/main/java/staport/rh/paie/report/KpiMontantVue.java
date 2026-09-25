package staport.rh.paie.report;

/**
 * KPI financier avec comparaison au mois précédent — {@code valeurPrecedente}/{@code variation*}
 * sont {@code null} quand aucun bulletin n'existe pour le mois précédent sur ce périmètre (distinct
 * d'une variation réellement nulle), voir {@code PaieReportNumberFormat}.
 */
record KpiMontantVue(
        String valeurCourante,
        String valeurPrecedente,
        String variationAbsolue,
        String variationPourcent,
        PaieReportNumberFormat.Tendance tendance
) {
}

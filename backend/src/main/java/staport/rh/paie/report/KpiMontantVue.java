package staport.rh.paie.report;

/**
 * KPI financier avec le montant du mois précédent — {@code valeurPrecedente} est {@code null} quand aucun
 * bulletin n'existe pour le mois précédent sur ce périmètre (distinct d'un montant réellement nul), voir
 * {@code PaieReportNumberFormat.masseOuNull}. {@code ecart} est présenté sous la masse courante uniquement dans la
 * vue d'ensemble ; les niveaux chantier et équipe gardent leurs KPI actuels.
 */
record KpiMontantVue(
        String valeurCourante,
        String valeurPrecedente,
        String ecart
) {

    KpiMontantVue(String valeurCourante, String valeurPrecedente) {
        this(valeurCourante, valeurPrecedente, null);
    }
}

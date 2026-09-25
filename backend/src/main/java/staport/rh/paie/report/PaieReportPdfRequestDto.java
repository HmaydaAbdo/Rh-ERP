package staport.rh.paie.report;

/**
 * Configuration du rapport PDF — un rapport BI RH/Paie de synthèse pour la direction (voir
 * {@code docs/report/README.md}), pas un export tabulaire (voir {@code PaieExportRequestDto} pour
 * celui-ci). Le périmètre reprend exactement les filtres déjà disponibles sur la page Paie
 * ({@code PaieSearchCriteria}, sans pagination) : {@code periode} obligatoire, les autres filtres
 * optionnels. Le mois précédent est recalculé automatiquement avec le même périmètre (hors
 * période) pour la comparaison — voir {@code PaieBiReportBuilder}.
 */
public record PaieReportPdfRequestDto(
        String periode,
        String nomPrenom,
        String cin,
        Long fonctionId,
        Long chantierId
) {
}

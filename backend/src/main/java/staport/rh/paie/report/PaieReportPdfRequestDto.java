package staport.rh.paie.report;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import java.util.List;
import java.util.Map;

/**
 * Configuration du rapport PDF — un rapport BI RH/Paie de synthèse pour la direction (voir
 * {@code docs/report/README.md}), pas un export tabulaire (voir {@code PaieExportRequestDto} pour
 * celui-ci). Le périmètre reprend exactement les filtres déjà disponibles sur la page Paie
 * ({@code PaieSearchCriteria}, sans pagination) : {@code periode} obligatoire, les autres filtres
 * optionnels. Le mois précédent est recalculé automatiquement avec le même périmètre (hors
 * période) pour la comparaison — voir {@code PaieBiReportBuilder}.
 *
 * <p>{@code equipesParChantier} : même forme et même sélection que {@code
 * PaieExportRequestDto.equipesParChantier} (demande explicite de direction, 2026-09-29 : export
 * PDF/Excel unifiés derrière un seul dialog, une seule sélection manuelle d'équipes à détailler) — un
 * chantier absent de cette map, ou dont la liste est vide, n'a aucune équipe détaillée séparément
 * (voir {@code ChantierBiVue.avecDetailEquipe}) : tous ses employés sont alors réunis dans une seule
 * section. {@code null} ou vide : aucun chantier détaillé par équipe.
 *
 * <p>{@code materiel} : nombre de chaque ligne du parc matériel (clé = libellé de la ligne, voir
 * {@code MaterielChantierCatalogue.tableaux()}) imprimé dans la colonne « Nbre » ; une ligne absente reste vide,
 * à remplir au stylo.
 */
public record PaieReportPdfRequestDto(
        String periode,
        String nomPrenom,
        String cin,
        Long fonctionId,
        Long chantierId,
        Map<String, List<String>> equipesParChantier,
        Map<String, @Min(0) @Max(999) Integer> materiel
) {
}

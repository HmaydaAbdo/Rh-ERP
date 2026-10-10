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
 *
 * <p>{@code sansVueEnsemble} : retire le chapitre « Vue d'ensemble » (indicateurs globaux et répartition par
 * chantier) — le rapport commence alors directement par le premier chantier, numéroté I (demande de direction,
 * 2026-10-10 : rapport limité au seul marché choisi avec {@code chantierId}, pour lequel la vue d'ensemble est
 * redondante). Absent, nul ou faux : rapport complet, comme avant (le champ est un {@code Boolean} nullable : un corps JSON
 * historique sans ce champ reste valide).
 */
public record PaieReportPdfRequestDto(
        String periode,
        String nomPrenom,
        String cin,
        Long fonctionId,
        Long chantierId,
        Map<String, List<String>> equipesParChantier,
        Map<String, @Min(0) @Max(999) Integer> materiel,
        Boolean sansVueEnsemble
) {

    /** Rapport complet (avec sa vue d'ensemble) : la forme historique de la requête. */
    public PaieReportPdfRequestDto(String periode, String nomPrenom, String cin, Long fonctionId, Long chantierId,
                                   Map<String, List<String>> equipesParChantier, Map<String, Integer> materiel) {
        this(periode, nomPrenom, cin, fonctionId, chantierId, equipesParChantier, materiel, null);
    }

    /** Vrai si le chapitre « Vue d'ensemble » doit être retiré ; un champ absent du corps JSON (anciens appelants) vaut faux. */
    public boolean vueEnsembleRetiree() {
        return Boolean.TRUE.equals(sansVueEnsemble);
    }
}

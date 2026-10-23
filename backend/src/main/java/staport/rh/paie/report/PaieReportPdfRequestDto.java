package staport.rh.paie.report;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

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
 * <p>{@code equipesParChantier} : la clé de chaque entrée est le code du chantier et ses valeurs sont
 * les libellés des équipes choisies. La même sélection alimente l'export PDF et Excel — un
 * chantier absent de cette map, ou dont la liste est vide, n'a aucune équipe détaillée séparément
 * (voir {@code ChantierBiVue.avecDetailEquipe}) : tous ses employés sont alors réunis dans une seule
 * section. {@code null} ou vide : aucun chantier détaillé par équipe.
 *
 * <p>{@code materiel} : nombre de chaque ligne du parc matériel (clé = libellé de la ligne, voir
 * {@code MaterielChantierCatalogue.tableaux()}) ; les lignes renseignées sont présentées dans le graphique du parc
 * matériel, et une ligne absente reste exclue de ce graphique.
 *
 * <p>{@code sansVueEnsemble} : retire le chapitre « Vue d'ensemble » (indicateurs globaux et répartition par
 * chantier) — le rapport commence alors directement par le premier chantier, numéroté I (demande de direction,
 * 2026-10-10 : rapport limité aux marchés choisis, pour lesquels la vue d'ensemble est
 * redondante). Absent, nul ou faux : rapport complet, comme avant (le champ est un {@code Boolean} nullable : un corps JSON
 * historique sans ce champ reste valide).
 */
public record PaieReportPdfRequestDto(
        String periode,
        String nomPrenom,
        String cin,
        Long fonctionId,
        /** Filtre multi-marchés de l'assistant PDF ; vide ou nul = tous. */
        @Size(max = 500) List<@NotNull Long> chantierIds,
        /** Compatibilité avec les clients antérieurs à la sélection multi-marchés. */
        Long chantierId,
        Map<String, List<String>> equipesParChantier,
        Map<String, @Min(0) @Max(999) Integer> materiel,
        Boolean sansVueEnsemble
) {

    /** Rapport complet (avec sa vue d'ensemble) : la forme historique de la requête. */
    public PaieReportPdfRequestDto(String periode, String nomPrenom, String cin, Long fonctionId, Long chantierId,
                                   Map<String, List<String>> equipesParChantier, Map<String, Integer> materiel) {
        this(periode, nomPrenom, cin, fonctionId, null, chantierId, equipesParChantier, materiel, null);
    }

    /** Forme historique avec choix explicite de la vue d'ensemble. */
    public PaieReportPdfRequestDto(String periode, String nomPrenom, String cin, Long fonctionId, Long chantierId,
                                   Map<String, List<String>> equipesParChantier, Map<String, Integer> materiel,
                                   Boolean sansVueEnsemble) {
        this(periode, nomPrenom, cin, fonctionId, null, chantierId, equipesParChantier, materiel, sansVueEnsemble);
    }

    /** IDs effectifs, avec priorité au filtre multi-valeurs lorsqu'il est fourni. */
    public List<Long> chantiersEffectifs() {
        if (chantierIds != null) {
            return chantierIds;
        }
        return chantierId == null ? null : List.of(chantierId);
    }

    /** Vrai si le chapitre « Vue d'ensemble » doit être retiré ; un champ absent du corps JSON (anciens appelants) vaut faux. */
    public boolean vueEnsembleRetiree() {
        return Boolean.TRUE.equals(sansVueEnsemble);
    }
}

package staport.rh.paie.dtos.response;

import java.math.BigDecimal;
import java.util.List;

/**
 * Tableau de bord analytique d'un mois sur un périmètre filtré (voir {@code docs/paie/README.md}, « Vue Analytique »).
 * {@code moisPrecedent} est {@code null} quand le mois contigu n'a aucun bulletin dans ce périmètre : la comparaison
 * est alors indisponible, jamais un zéro trompeur. {@code evolution} couvre au plus les 12 derniers mois qui ont de la
 * paie dans le périmètre, du plus ancien au plus récent.
 */
public record PaieAnalytiqueDto(
        String periode,
        Kpi kpis,
        Kpi moisPrecedent,
        List<ChantierMasse> parChantier,
        List<FonctionMasse> parFonction,
        List<Tranche> tranches,
        List<Evolution> evolution,
        Qualite qualite
) {

    /** {@code coutMoyen} = masse ÷ effectif, {@code null} sans bulletin. {@code stc} : même définition que le rapport PDF. */
    public record Kpi(BigDecimal masse, long effectif, BigDecimal coutMoyen, long nombreChantiers, long stc) {
    }

    public record ChantierMasse(Long id, String code, String libelle, BigDecimal masse, long effectif, long stc) {
    }

    public record FonctionMasse(Long id, String libelle, BigDecimal masse, long effectif) {
    }

    /** Tranche de {@code salaireTotal} : de {@code min} (inclus) à {@code max} (exclu) ; {@code max} nul pour la dernière
     * tranche, ouverte. */
    public record Tranche(BigDecimal min, BigDecimal max, long effectif) {
    }

    public record Evolution(String periode, BigDecimal masse, long effectif) {
    }

    /** Bulletins du périmètre auxquels il manque une information facultative. */
    public record Qualite(long sansEquipe, long sansObservation) {
    }
}

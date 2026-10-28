package staport.rh.paie.dtos.response;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/** Résultat métier de comparaison de deux périodes de paie sur le même périmètre. */
public record PaieComparaisonDto(
        String periode,
        String periodeReference,
        Dimension dimension,
        int nombreGroupes,
        Total total,
        Groupe plusForteHausse,
        Groupe plusForteBaisse,
        Groupe plusForteHausseDuPerimetre,
        Groupe plusForteBaisseDuPerimetre,
        List<Groupe> groupes,
        Map<String, String> definitions
) {
    public enum Dimension { CHANTIER, EQUIPE, FONCTION }

    public enum Tri { MASSE, VARIATION_MASSE, VARIATION_POURCENTAGE, EFFECTIF, VARIATION_EFFECTIF, LIBELLE }

    public record Total(BigDecimal masse, BigDecimal masseReference, BigDecimal variationMasse,
                        BigDecimal variationPourcentage, long effectif, Long effectifReference,
                        Long variationEffectif, BigDecimal coutMoyen, BigDecimal coutMoyenReference) {
    }

    /** {@code statut}: COMPARABLE, NOUVEAU ou DISPARU. Les variations sont nulles si un mois manque. */
    public record Groupe(Long id, String code, String libelle, String statut, BigDecimal masse,
                        BigDecimal masseReference, BigDecimal variationMasse, BigDecimal variationPourcentage,
                        Long effectif, Long effectifReference, Long variationEffectif,
                        BigDecimal coutMoyen, BigDecimal coutMoyenReference, FonctionPrincipale fonctionPrincipale) {
    }

    public record FonctionPrincipale(String libelle, long effectif) {
    }
}

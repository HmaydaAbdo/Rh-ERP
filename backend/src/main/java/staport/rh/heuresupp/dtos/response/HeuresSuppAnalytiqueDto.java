package staport.rh.heuresupp.dtos.response;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.List;

/** Indicateurs et répartitions produits côté base, avec les définitions destinées aux écrans et à l'assistant IA. */
public record HeuresSuppAnalytiqueDto(
        YearMonth periode,
        Indicateurs indicateurs,
        List<Groupe> parChantier,
        List<Groupe> parFonction,
        List<Groupe> parEquipe,
        Definitions definitions
) {
    public record Indicateurs(long employes, long lignesHeures, BigDecimal heures, BigDecimal montantDh,
                              BigDecimal stcDh, BigDecimal forfaitDh, BigDecimal netAPayerDh) {
    }

    public record Groupe(Long id, String code, String libelle, long lignesHeures, long effectif, BigDecimal heures,
                         BigDecimal montantDh, BigDecimal stcDh, BigDecimal forfaitDh, BigDecimal netAPayerDh) {
    }

    public record Definitions(String heures, String montantDh, String stcDh, String forfaitDh, String netAPayerDh) {
    }
}

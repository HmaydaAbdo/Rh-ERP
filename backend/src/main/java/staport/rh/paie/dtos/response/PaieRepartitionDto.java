package staport.rh.paie.dtos.response;

import java.math.BigDecimal;
import java.util.List;

/** Répartition d'un mois de paie, triée selon le critère demandé par l'API publique du domaine. */
public record PaieRepartitionDto(String periode, Dimension dimension, int nombreGroupes, List<Groupe> groupes) {

    public enum Dimension { CHANTIER, EQUIPE, FONCTION }

    public enum Tri { MASSE, EFFECTIF, STC, STC_MONTANT, LIBELLE, CODE }

    public record Groupe(Long id, String code, String libelle, BigDecimal masse, long effectif, long stc,
                         BigDecimal stcMontant) {
    }
}

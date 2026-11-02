package staport.rh.heuresupp.services;

import staport.rh.employee.entities.TypeSalaire;

import java.math.BigDecimal;
import java.math.RoundingMode;

/** Définitions déterministes des montants d'heures supplémentaires, partagées par l'API et les outils IA. */
public final class CalculHeuresSupp {

    private static final BigDecimal DIX = BigDecimal.TEN;
    private static final BigDecimal DEUX_CENT_SOIXANTE = new BigDecimal("260");
    private static final BigDecimal ZERO_MONTANT = new BigDecimal("0.00");
    /** S/H n'a pas de virgule : le taux horaire est un nombre entier de dirhams. */
    private static final int ECHELLE_TAUX = 0;

    private CalculHeuresSupp() {
    }

    /**
     * Salaire journalier / 10 ou salaire mensuel / 26 / 10, arrondi à l'entier de dirham (HALF_DOWN : fraction
     * supérieure à 0,5 on monte, inférieure à 0,5 on descend, exactement 0,5 on descend). Le taux arrondi est la
     * valeur stockée et celle dont découlent les montants.
     */
    public static BigDecimal salaireHoraire(BigDecimal salaire, TypeSalaire typeSalaire) {
        if (salaire == null || typeSalaire == null) {
            throw new IllegalArgumentException("Le salaire et son type sont nécessaires au calcul de S/H.");
        }
        return switch (typeSalaire) {
            case JOURNALIER -> salaire.divide(DIX, ECHELLE_TAUX, RoundingMode.HALF_DOWN);
            case MENSUEL -> salaire.divide(DEUX_CENT_SOIXANTE, ECHELLE_TAUX, RoundingMode.HALF_DOWN);
        };
    }

    /** Montant = S/H × P/H, arrondi à deux décimales de dirham. */
    public static BigDecimal montant(BigDecimal salaireHoraire, BigDecimal heures) {
        if (salaireHoraire == null || heures == null) {
            return ZERO_MONTANT;
        }
        return salaireHoraire.multiply(heures).setScale(2, RoundingMode.HALF_UP);
    }

    /** STC (DH) = Montant pour une paie marquée STC/sortie du même mois, sinon 0 DH. */
    public static BigDecimal stcDh(BigDecimal montant, boolean stcOuSortie) {
        return stcOuSortie ? montant : ZERO_MONTANT;
    }

    /** Net à payer = Montant - STC (DH) + Forfait, le forfait étant distinct du Montant. */
    public static BigDecimal netAPayer(BigDecimal montant, BigDecimal stcDh, BigDecimal forfait) {
        return montant.subtract(stcDh).add(forfait == null ? ZERO_MONTANT : forfait).setScale(2, RoundingMode.UNNECESSARY);
    }
}

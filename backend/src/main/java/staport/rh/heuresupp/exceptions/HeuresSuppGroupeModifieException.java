package staport.rh.heuresupp.exceptions;

public class HeuresSuppGroupeModifieException extends RuntimeException {
    public HeuresSuppGroupeModifieException(long actuel, long confirme) {
        super("Le mois contient maintenant " + actuel + " lignes au lieu des " + confirme + " confirmées. Aucune ligne n'a été supprimée ; actualisez puis recommencez.");
    }
}

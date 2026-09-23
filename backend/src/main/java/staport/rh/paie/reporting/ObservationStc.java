package staport.rh.paie.reporting;

import staport.rh.paie.entities.Paie;

import java.util.Locale;

/**
 * Règle "STC / sortie" utilisée par le récapitulatif "effectif par fonction" — partagée entre
 * l'export Excel ({@code PaieSheetWriter}) et le rapport PDF pour ne jamais dupliquer la
 * définition. Comparaison insensible à la casse et aux espaces superflus ; une observation qui ne
 * vaut pas exactement "STC" ou "sortie" (ex. absente, ou un commentaire libre contenant ce mot)
 * n'est pas comptée.
 */
public final class ObservationStc {

    private ObservationStc() {
    }

    public static boolean estStcOuSortie(Paie paie) {
        String observation = paie.getObservation();
        if (observation == null) {
            return false;
        }
        String normalisee = observation.trim().toLowerCase(Locale.ROOT);
        return normalisee.equals("stc") || normalisee.equals("sortie");
    }
}

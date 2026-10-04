package staport.rh.paie.exceptions;

/**
 * Levée quand une suppression en groupe ne porte plus sur le nombre de bulletins que l'utilisateur a confirmé : les
 * données ont changé entre l'affichage de la carte et la confirmation (import, suppression par un autre utilisateur…).
 * Rien n'est supprimé : mieux vaut refuser que supprimer autre chose que ce qui a été validé.
 */
public class PaieGroupeModifieException extends RuntimeException {

    public PaieGroupeModifieException(long actuel, long attendu) {
        super("Le groupe a changé depuis son affichage : " + actuel + " bulletin(s) correspondent maintenant, " + attendu
                + " étaient attendus. Rien n'a été supprimé, actualisez la page.");
    }
}

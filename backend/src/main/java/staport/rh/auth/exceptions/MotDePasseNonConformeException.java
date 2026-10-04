package staport.rh.auth.exceptions;

/** Mot de passe refusé par la règle de {@code PolitiqueMotDePasse} : le message rappelle la règle, jamais la valeur saisie. */
public class MotDePasseNonConformeException extends RuntimeException {

    public MotDePasseNonConformeException(int longueurMin) {
        super("Mot de passe non conforme : " + longueurMin + " caractères minimum, avec au moins une lettre et un chiffre, "
                + "et différent de l'identifiant.");
    }
}

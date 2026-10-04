package staport.rh.auth.security;

import staport.rh.auth.exceptions.MotDePasseNonConformeException;

/**
 * La règle des mots de passe, en un seul endroit (conventions/security.md) : {@value #LONGUEUR_MIN} caractères au
 * minimum, au moins une lettre et un chiffre, différent de l'identifiant (sans tenir compte de la casse).
 *
 * <p>S'applique à la création d'un compte et aux deux réinitialisations (par lien, par un administrateur) ; les mots de
 * passe existants ne changent pas. Le mot de passe du compte d'amorçage vient de la configuration de l'exploitant et n'y est
 * pas soumis. Le frontend répète la longueur, la lettre et le chiffre pour guider la saisie ; le serveur reste l'autorité.
 */
public final class PolitiqueMotDePasse {

    public static final int LONGUEUR_MIN = 10;

    private PolitiqueMotDePasse() {
    }

    /** @throws MotDePasseNonConformeException si le mot de passe ne respecte pas la règle */
    public static void exiger(String motDePasse, String identifiant) {
        boolean conforme = motDePasse != null
                && motDePasse.length() >= LONGUEUR_MIN
                && motDePasse.codePoints().anyMatch(Character::isLetter)
                && motDePasse.codePoints().anyMatch(Character::isDigit)
                && !motDePasse.equalsIgnoreCase(identifiant);
        if (!conforme) {
            throw new MotDePasseNonConformeException(LONGUEUR_MIN);
        }
    }
}

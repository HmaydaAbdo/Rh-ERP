package staport.rh.auth.security;

import org.springframework.stereotype.Component;
import staport.rh.auth.exceptions.MotDePasseNonConformeException;
import staport.rh.parametre.services.interfaces.IParametreService;

/**
 * La règle des mots de passe, en un seul endroit (conventions/security.md) : une longueur minimale réglable par un
 * administrateur (paramètre « Longueur minimale du mot de passe »), différent de l'identifiant (sans tenir compte de la casse).
 *
 * <p>S'applique à la création d'un compte et aux deux réinitialisations (par lien, par un administrateur) ; les mots de
 * passe existants ne changent pas. Le mot de passe du compte d'amorçage vient de la configuration de l'exploitant et n'y est
 * pas soumis. Le frontend lit la longueur sur {@code GET /auth/password-policy} et répète la règle pour guider la saisie ;
 * le serveur reste l'autorité.
 */
@Component
public class PolitiqueMotDePasse {

    private final IParametreService parametres;

    public PolitiqueMotDePasse(IParametreService parametres) {
        this.parametres = parametres;
    }

    public int longueurMin() {
        return parametres.longueurMinimaleMotDePasse();
    }

    /** @throws MotDePasseNonConformeException si le mot de passe ne respecte pas la règle */
    public void exiger(String motDePasse, String identifiant) {
        int longueurMin = longueurMin();
        boolean conforme = motDePasse != null
                && motDePasse.length() >= longueurMin
                && !motDePasse.equalsIgnoreCase(identifiant);
        if (!conforme) {
            throw new MotDePasseNonConformeException(longueurMin);
        }
    }
}

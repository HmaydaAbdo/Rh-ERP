package staport.rh.auth.exceptions;

/**
 * Modification refusée : le rôle d'administration de départ ne peut être ni supprimé, ni renommé, ni privé de permissions —
 * l'une ou l'autre laisserait le système sans administrateur (ou sans moyen de le redevenir) et ferait échouer la création
 * du premier compte (conventions/security.md).
 */
public class ProtectedRoleException extends RuntimeException {

    public ProtectedRoleException(String nom, String interdit) {
        super("Le rôle « " + nom + " » est protégé : il ne peut pas être " + interdit + ".");
    }
}

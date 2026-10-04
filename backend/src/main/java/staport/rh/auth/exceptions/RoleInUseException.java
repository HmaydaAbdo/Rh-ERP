package staport.rh.auth.exceptions;

/**
 * Suppression refusée : le rôle est encore attribué. La supprimer retirerait ces droits en silence
 * (conventions/security.md, « Suppression d'un rôle ») — il faut d'abord le retirer des comptes concernés.
 */
public class RoleInUseException extends RuntimeException {

    public RoleInUseException(String nom, long nombreDeComptes) {
        super("Le rôle « " + nom + " » est attribué à " + nombreDeComptes
                + " compte(s) : retirez-le d'abord de ces comptes avant de le supprimer.");
    }
}

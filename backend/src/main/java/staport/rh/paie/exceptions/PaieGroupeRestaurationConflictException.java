package staport.rh.paie.exceptions;

/** Le groupe entier est refusé si un bulletin employé/mois existe déjà ou si une référence n'existe plus. */
public class PaieGroupeRestaurationConflictException extends RuntimeException {

    public PaieGroupeRestaurationConflictException(int nombreConflits) {
        super("Restauration refusée : " + nombreConflits
                + " conflit(s) employé/mois ou référence manquante. Aucun bulletin n'a été restauré.");
    }
}

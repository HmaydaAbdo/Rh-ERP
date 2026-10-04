package staport.rh.audit.context;

import org.slf4j.MDC;

import java.util.UUID;

/**
 * Contexte d'audit d'un traitement qui s'exécute hors requête HTTP (tâche planifiée, initialisation) : il n'y a
 * alors ni utilisateur authentifié ni requête, et sans ce contexte les écritures seraient attribuées à une
 * origine {@link Origine#INCONNUE}. C'est la première source consultée par {@link ResolveurContexteAudit}.
 *
 * <p>Le traitement ouvre le contexte dans un {@code try-with-resources} ; l'identifiant d'exécution généré tient
 * lieu de {@code request_id} (corrélation entre les révisions des transactions successives d'un même traitement)
 * et est posé dans le MDC pour que les logs du traitement le portent aussi.
 */
public final class BatchAuditContext {

    private static final ThreadLocal<Contexte> COURANT = new ThreadLocal<>();

    private BatchAuditContext() {
    }

    /** Qui agit, depuis quelle origine, et sous quel identifiant d'exécution. */
    public record Contexte(String utilisateurNom, Origine origine, String requestId) {
    }

    /** Ouvre le contexte pour le thread courant ; à refermer (try-with-resources). */
    public static Scope ouvrir(String utilisateurNom, Origine origine) {
        Contexte precedent = COURANT.get();
        String requestIdPrecedent = MDC.get(ResolveurContexteAudit.MDC_REQUEST_ID);
        Contexte contexte = new Contexte(utilisateurNom, origine, UUID.randomUUID().toString());
        COURANT.set(contexte);
        MDC.put(ResolveurContexteAudit.MDC_REQUEST_ID, contexte.requestId());
        return new Scope(precedent, requestIdPrecedent);
    }

    static Contexte courant() {
        return COURANT.get();
    }

    /** Referme le contexte et restaure l'état précédent du thread (contexte imbriqué, MDC). */
    public static final class Scope implements AutoCloseable {

        private final Contexte precedent;
        private final String requestIdPrecedent;

        private Scope(Contexte precedent, String requestIdPrecedent) {
            this.precedent = precedent;
            this.requestIdPrecedent = requestIdPrecedent;
        }

        @Override
        public void close() {
            if (precedent == null) {
                COURANT.remove();
            } else {
                COURANT.set(precedent);
            }
            if (requestIdPrecedent == null) {
                MDC.remove(ResolveurContexteAudit.MDC_REQUEST_ID);
            } else {
                MDC.put(ResolveurContexteAudit.MDC_REQUEST_ID, requestIdPrecedent);
            }
        }
    }
}

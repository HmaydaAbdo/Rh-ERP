package staport.rh.audit.services;

import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import staport.rh.audit.context.ContexteAudit;
import staport.rh.audit.entities.AuditJournalEntry;
import staport.rh.audit.repositories.AuditJournalRepository;

/**
 * Seul point d'écriture du journal d'audit. Deux modes (conventions/audit.md, « Transaction ») :
 * <ul>
 *   <li>dans la transaction courante — l'entrée d'une opération réussie est validée ou annulée avec ses données ;</li>
 *   <li>dans une transaction séparée ({@code REQUIRES_NEW}) — un échec, une sortie de données ou un événement de
 *       sécurité restent tracés même si la transaction de l'appelant est annulée.</li>
 * </ul>
 */
@Component
public class AuditJournalWriter {

    private final AuditJournalRepository repository;
    private final TransactionTemplate dansLaTransaction;
    private final TransactionTemplate dansUneNouvelleTransaction;

    public AuditJournalWriter(AuditJournalRepository repository, PlatformTransactionManager gestionnaire) {
        this.repository = repository;
        this.dansLaTransaction = new TransactionTemplate(gestionnaire);
        this.dansUneNouvelleTransaction = new TransactionTemplate(gestionnaire);
        this.dansUneNouvelleTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /** Une entrée préremplie avec qui, d'où et sous quel identifiant de requête. */
    public static AuditJournalEntry.Builder entreePour(ContexteAudit contexte) {
        return AuditJournalEntry.builder()
                .utilisateurId(contexte.utilisateurId())
                .utilisateurNom(contexte.utilisateurNom())
                .origine(contexte.origine())
                .requestId(contexte.requestId())
                .adresseIp(contexte.adresseIp())
                .userAgent(contexte.userAgent());
    }

    /**
     * Envoie les écritures en attente à la base. Passe par le repository (et non par l'{@code EntityManager}) pour que
     * une violation de contrainte soit traduite en {@code DataIntegrityViolationException}, comme elle l'était au
     * commit : les gestionnaires d'exceptions des modules (« fonction utilisée », par exemple) en dépendent.
     */
    public void flush() {
        repository.flush();
    }

    /** Rejoint la transaction en cours (ou en ouvre une s'il n'y en a pas). */
    public void ecrire(AuditJournalEntry entree) {
        dansLaTransaction.executeWithoutResult(statut -> repository.save(entree));
    }

    public void ecrireSeparement(AuditJournalEntry entree) {
        dansUneNouvelleTransaction.executeWithoutResult(statut -> repository.save(entree));
    }
}

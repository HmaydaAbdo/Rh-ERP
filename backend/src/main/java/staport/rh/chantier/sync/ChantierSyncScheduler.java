package staport.rh.chantier.sync;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import staport.rh.audit.context.BatchAuditContext;
import staport.rh.audit.context.Origine;
import staport.rh.audit.context.ResolveurContexteAudit;

@Component
public class ChantierSyncScheduler {

    private final ChantierSyncService syncService;

    public ChantierSyncScheduler(ChantierSyncService syncService) {
        this.syncService = syncService;
    }

    @Scheduled(cron = "${chantier.sync.cron}")
    public void synchroniserQuotidiennement() {
        // Aucun utilisateur ni requête : les chantiers créés sont attribués à « Système », d'origine TACHE_PLANIFIEE,
        // sous un identifiant d'exécution unique (conventions/audit.md).
        try (BatchAuditContext.Scope ignore = BatchAuditContext.ouvrir(ResolveurContexteAudit.SYSTEME, Origine.TACHE_PLANIFIEE)) {
            syncService.synchroniser();
        }
    }
}

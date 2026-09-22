package staport.rh.chantier.sync;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class ChantierSyncScheduler {

    private final ChantierSyncService syncService;

    public ChantierSyncScheduler(ChantierSyncService syncService) {
        this.syncService = syncService;
    }

    @Scheduled(cron = "${chantier.sync.cron}")
    public void synchroniserQuotidiennement() {
        syncService.synchroniser();
    }
}

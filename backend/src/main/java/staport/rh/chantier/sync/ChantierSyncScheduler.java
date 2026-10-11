package staport.rh.chantier.sync;

import org.springframework.scheduling.annotation.SchedulingConfigurer;
import org.springframework.scheduling.config.ScheduledTaskRegistrar;
import org.springframework.scheduling.support.CronTrigger;
import org.springframework.stereotype.Component;
import staport.rh.audit.context.BatchAuditContext;
import staport.rh.audit.context.Origine;
import staport.rh.audit.context.ResolveurContexteAudit;
import staport.rh.parametre.services.interfaces.IParametreService;

@Component
public class ChantierSyncScheduler implements SchedulingConfigurer {

    private final ChantierSyncService syncService;
    private final IParametreService parametres;

    public ChantierSyncScheduler(ChantierSyncService syncService, IParametreService parametres) {
        this.syncService = syncService;
        this.parametres = parametres;
    }

    /**
     * La planification est le paramètre « Planification de la synchronisation des chantiers » (conventions/configuration.md :
     * jamais dans {@code application.yml}). Le déclencheur relit le paramètre à chaque calcul de la prochaine exécution : un
     * changement s'applique donc après l'exécution en cours d'attente, sans redémarrage.
     */
    @Override
    public void configureTasks(ScheduledTaskRegistrar registrar) {
        registrar.addTriggerTask(this::synchroniserQuotidiennement,
                contexte -> new CronTrigger(parametres.cronSynchronisationChantiers()).nextExecution(contexte));
    }

    public void synchroniserQuotidiennement() {
        // Aucun utilisateur ni requête : les chantiers créés sont attribués à « Système », d'origine TACHE_PLANIFIEE,
        // sous un identifiant d'exécution unique (conventions/audit.md).
        try (BatchAuditContext.Scope ignore = BatchAuditContext.ouvrir(ResolveurContexteAudit.SYSTEME, Origine.TACHE_PLANIFIEE)) {
            syncService.synchroniser();
        }
    }
}

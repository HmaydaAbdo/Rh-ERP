package staport.rh.chantier.sync;

import org.junit.jupiter.api.Test;
import org.springframework.scheduling.Trigger;
import org.springframework.scheduling.config.ScheduledTaskRegistrar;
import org.springframework.scheduling.config.TriggerTask;
import org.springframework.scheduling.support.SimpleTriggerContext;
import staport.rh.parametre.services.interfaces.IParametreService;
import staport.rh.support.ParametresDeTest;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** La planification de la synchronisation est le paramètre « cron », relu à chaque calcul de la prochaine exécution. */
class ChantierSyncSchedulerTest {

    private final ChantierSyncService syncService = mock(ChantierSyncService.class);

    @Test
    void la_prochaine_execution_suit_le_cron_du_parametre() {
        IParametreService parametres = mock(IParametreService.class);
        when(parametres.cronSynchronisationChantiers()).thenReturn("0 0 23 * * *");
        Trigger declencheur = declencheur(parametres);
        SimpleTriggerContext contexte = new SimpleTriggerContext(Clock.fixed(Instant.parse("2026-10-11T10:00:00Z"), ZoneOffset.UTC));

        Instant premiere = declencheur.nextExecution(contexte);

        assertThat(premiere).isEqualTo(Instant.parse("2026-10-11T23:00:00Z"));

        // Un administrateur change l'heure : le calcul suivant en tient compte, sans redémarrage.
        when(parametres.cronSynchronisationChantiers()).thenReturn("0 0 2 * * *");
        assertThat(declencheur.nextExecution(contexte)).isEqualTo(Instant.parse("2026-10-12T02:00:00Z"));
    }

    @Test
    void la_tache_est_enregistree_une_seule_fois() {
        ScheduledTaskRegistrar registrar = new ScheduledTaskRegistrar();
        new ChantierSyncScheduler(syncService, ParametresDeTest.parDefaut()).configureTasks(registrar);

        assertThat(registrar.getTriggerTaskList()).hasSize(1);
    }

    private Trigger declencheur(IParametreService parametres) {
        ScheduledTaskRegistrar registrar = new ScheduledTaskRegistrar();
        new ChantierSyncScheduler(syncService, parametres).configureTasks(registrar);
        TriggerTask tache = registrar.getTriggerTaskList().get(0);
        return tache.getTrigger();
    }
}

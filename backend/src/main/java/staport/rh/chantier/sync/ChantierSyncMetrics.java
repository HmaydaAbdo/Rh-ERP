package staport.rh.chantier.sync;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;

@Component
public class ChantierSyncMetrics {

    private final Counter successCounter;
    private final Counter failureCounter;
    private final Counter ignoredRecordsCounter;
    private final Timer durationTimer;

    public ChantierSyncMetrics(MeterRegistry registry) {
        this.successCounter = Counter.builder("rh.chantier.sync.success")
                .description("Nombre de synchronisations chantier réussies")
                .register(registry);
        this.failureCounter = Counter.builder("rh.chantier.sync.failure")
                .description("Nombre de synchronisations chantier échouées")
                .register(registry);
        this.ignoredRecordsCounter = Counter.builder("rh.chantier.sync.records.ignored")
                .description("Nombre de lignes ERP ignorées (code manquant ou conflit d'intégrité)")
                .register(registry);
        this.durationTimer = Timer.builder("rh.chantier.sync.duration")
                .description("Durée d'une synchronisation chantier")
                .publishPercentileHistogram()
                .register(registry);
    }

    public void recordSuccess(long durationMillis) {
        successCounter.increment();
        durationTimer.record(durationMillis, TimeUnit.MILLISECONDS);
    }

    public void recordFailure(long durationMillis) {
        failureCounter.increment();
        durationTimer.record(durationMillis, TimeUnit.MILLISECONDS);
    }

    public void recordIgnoredRecords(int count) {
        ignoredRecordsCounter.increment(count);
    }
}

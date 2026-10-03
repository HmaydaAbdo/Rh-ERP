package staport.rh.chantier.sync;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Réconciliation des chantiers avec l'ERP source (webServiceBS/getChantiers).
 * Upsert par code (id_chantier n'est pas un identifiant fiable par chantier — voir
 * Chantier.sourceErp) : chaque ligne reçue crée ou met à jour un chantier, quel que soit son
 * {@code CodeErreur} — ce champ n'est pas utilisé comme un filtre. Aucune désactivation
 * automatique : un chantier absent d'un import ERP conserve son état précédent.
 */
@Service
public class ChantierSyncService {

    private static final Logger log = LoggerFactory.getLogger(ChantierSyncService.class);

    private final ChantierSyncClient client;
    private final ChantierSyncTransactionalOperations transactionalOperations;
    private final ChantierSyncMetrics metrics;

    public ChantierSyncService(ChantierSyncClient client,
                                ChantierSyncTransactionalOperations transactionalOperations,
                                ChantierSyncMetrics metrics) {
        this.client = client;
        this.transactionalOperations = transactionalOperations;
        this.metrics = metrics;
    }

    public ChantierSyncResultDto synchroniser() {
        long start = System.currentTimeMillis();
        try {
            ChantierSyncResultDto result = doSynchronize();
            metrics.recordSuccess(System.currentTimeMillis() - start);
            log.info("Synchronisation chantiers terminée : reçus={}, créés={}, déjàPrésents={}, ignorés={}",
                    result.totalRecus(), result.crees(), result.dejaPresents(), result.ignores());
            return result;
        } catch (Exception e) {
            metrics.recordFailure(System.currentTimeMillis() - start);
            log.error("Échec de la synchronisation chantiers", e);
            throw e;
        }
    }

    private ChantierSyncResultDto doSynchronize() {
        List<ChantierErpDto> records = client.fetchChantiers();

        int crees = 0;
        int dejaPresents = 0;
        int ignores = 0;

        for (ChantierErpDto record : records) {
            if (record.code() == null || record.code().isBlank()) {
                log.warn("Ligne ERP ignorée (code manquant) : idChantier={}", record.idChantier());
                ignores++;
                continue;
            }

            try {
                if (transactionalOperations.creerSiAbsent(record)) {
                    crees++;
                } else {
                    dejaPresents++;
                }
            } catch (DataIntegrityViolationException e) {
                log.warn("Ligne ERP ignorée (conflit d'intégrité) : code={}", record.code());
                ignores++;
            }
        }

        metrics.recordIgnoredRecords(ignores);

        return new ChantierSyncResultDto(records.size(), crees, dejaPresents, ignores);
    }
}

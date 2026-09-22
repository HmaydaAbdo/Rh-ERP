package staport.rh.chantier.sync;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChantierSyncServiceTest {

    @Mock
    private ChantierSyncClient client;

    @Mock
    private ChantierSyncTransactionalOperations transactionalOperations;

    @Mock
    private ChantierSyncMetrics metrics;

    @InjectMocks
    private ChantierSyncService syncService;

    @Test
    void synchroniser_devraitCreerEtMettreAJourSelonLetatExistant() {
        ChantierErpDto nouveau = new ChantierErpDto(1L, "Chantier neuf", "C001", 0);
        ChantierErpDto existant = new ChantierErpDto(2L, "Chantier existant", "C002", 0);
        when(client.fetchChantiers()).thenReturn(List.of(nouveau, existant));
        when(transactionalOperations.upsert(nouveau)).thenReturn(true);
        when(transactionalOperations.upsert(existant)).thenReturn(false);

        ChantierSyncResultDto result = syncService.synchroniser();

        assertThat(result.totalRecus()).isEqualTo(2);
        assertThat(result.crees()).isEqualTo(1);
        assertThat(result.misAJour()).isEqualTo(1);
        assertThat(result.ignores()).isZero();
        verify(metrics).recordSuccess(anyLong());
    }

    @Test
    void synchroniser_devraitTraiterUneLigneMemeQuandCodeErreurEstNonNul() {
        ChantierErpDto ligneEnErreurErp = new ChantierErpDto(1L, "Chantier en erreur ERP", "C001", 5);
        when(client.fetchChantiers()).thenReturn(List.of(ligneEnErreurErp));
        when(transactionalOperations.upsert(ligneEnErreurErp)).thenReturn(true);

        ChantierSyncResultDto result = syncService.synchroniser();

        assertThat(result.crees()).isEqualTo(1);
        assertThat(result.ignores()).isZero();
        verify(transactionalOperations).upsert(ligneEnErreurErp);
    }

    @Test
    void synchroniser_devraitIgnorerUneLigneAvecCodeManquant() {
        ChantierErpDto sansCode = new ChantierErpDto(1L, "Chantier sans code", null, 0);
        when(client.fetchChantiers()).thenReturn(List.of(sansCode));

        ChantierSyncResultDto result = syncService.synchroniser();

        assertThat(result.ignores()).isEqualTo(1);
        assertThat(result.crees()).isZero();
        verify(transactionalOperations, never()).upsert(any());
        verify(metrics).recordIgnoredRecords(1);
    }

    @Test
    void synchroniser_devraitIgnorerLaLigneEtContinuerQuandConflitIntegrite() {
        ChantierErpDto record1 = new ChantierErpDto(1L, "Chantier 1", "C001", 0);
        ChantierErpDto record2 = new ChantierErpDto(2L, "Chantier 2", "C002", 0);
        when(client.fetchChantiers()).thenReturn(List.of(record1, record2));
        when(transactionalOperations.upsert(record1)).thenThrow(new DataIntegrityViolationException("conflit"));
        when(transactionalOperations.upsert(record2)).thenReturn(true);

        ChantierSyncResultDto result = syncService.synchroniser();

        assertThat(result.ignores()).isEqualTo(1);
        assertThat(result.crees()).isEqualTo(1);
        verify(transactionalOperations, times(2)).upsert(any());
    }

    @Test
    void synchroniser_devraitEnregistrerUnEchecEtRelancerQuandLeClientEchoue() {
        when(client.fetchChantiers()).thenThrow(new RuntimeException("ERP indisponible"));

        try {
            syncService.synchroniser();
        } catch (RuntimeException ignored) {
            // attendu
        }

        verify(metrics).recordFailure(anyLong());
        verify(transactionalOperations, never()).upsert(any());
    }
}

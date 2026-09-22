package staport.rh.chantier.sync;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import staport.rh.chantier.entities.Chantier;
import staport.rh.chantier.repositories.ChantierRepository;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChantierSyncTransactionalOperationsTest {

    @Mock
    private ChantierRepository repository;

    @InjectMocks
    private ChantierSyncTransactionalOperations operations;

    @Test
    void upsert_devraitCreerUnNouveauChantierActif() {
        when(repository.findByCodeIgnoreCase("C001")).thenReturn(Optional.empty());
        when(repository.save(any(Chantier.class))).thenAnswer(invocation -> invocation.getArgument(0));

        boolean isNew = operations.upsert(new ChantierErpDto(1L, "Nouveau chantier", "C001", 0));

        assertThat(isNew).isTrue();
    }

    @Test
    void upsert_neDoitPasReactiverUnChantierDesactiveManuellement() {
        Chantier existant = new Chantier();
        existant.setId(5L);
        existant.setCode("C002");
        existant.setActif(false);
        when(repository.findByCodeIgnoreCase("C002")).thenReturn(Optional.of(existant));
        when(repository.save(any(Chantier.class))).thenAnswer(invocation -> invocation.getArgument(0));

        boolean isNew = operations.upsert(new ChantierErpDto(2L, "Chantier existant", "C002", 0));

        assertThat(isNew).isFalse();
        assertThat(existant.isActif()).isFalse();
    }

    @Test
    void upsert_devraitConserverActifQuandLeChantierExistantEstDejaActif() {
        Chantier existant = new Chantier();
        existant.setId(6L);
        existant.setCode("C003");
        existant.setActif(true);
        when(repository.findByCodeIgnoreCase("C003")).thenReturn(Optional.of(existant));
        when(repository.save(any(Chantier.class))).thenAnswer(invocation -> invocation.getArgument(0));

        operations.upsert(new ChantierErpDto(3L, "Chantier actif", "C003", 0));

        assertThat(existant.isActif()).isTrue();
    }

    @Test
    void upsert_devraitReussirMemeQuandCodeErreurEstNonNul() {
        when(repository.findByCodeIgnoreCase("C004")).thenReturn(Optional.empty());
        when(repository.save(any(Chantier.class))).thenAnswer(invocation -> invocation.getArgument(0));

        boolean isNew = operations.upsert(new ChantierErpDto(4L, "Chantier en erreur ERP", "C004", 5));

        assertThat(isNew).isTrue();
    }
}

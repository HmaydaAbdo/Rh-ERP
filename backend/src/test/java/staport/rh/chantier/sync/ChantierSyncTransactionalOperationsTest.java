package staport.rh.chantier.sync;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import staport.rh.chantier.entities.Chantier;
import staport.rh.chantier.repositories.ChantierRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChantierSyncTransactionalOperationsTest {

    @Mock
    private ChantierRepository repository;

    @InjectMocks
    private ChantierSyncTransactionalOperations operations;

    @Test
    void creerSiAbsent_devraitCreerUnNouveauChantierActifIssuDeLErp() {
        when(repository.existsByCodeIgnoreCase("C001")).thenReturn(false);

        boolean cree = operations.creerSiAbsent(new ChantierErpDto(1L, "Nouveau chantier", "C001", 0));

        assertThat(cree).isTrue();
        ArgumentCaptor<Chantier> captor = ArgumentCaptor.forClass(Chantier.class);
        verify(repository).save(captor.capture());
        assertThat(captor.getValue().getCode()).isEqualTo("C001");
        assertThat(captor.getValue().getDesignation()).isEqualTo("Nouveau chantier");
        assertThat(captor.getValue().isSourceErp()).isTrue();
        assertThat(captor.getValue().isActif()).isTrue();
    }

    @Test
    void creerSiAbsent_neDoitJamaisModifierUnChantierExistant() {
        // Le code existe déjà (casse différente comprise) : ni sauvegarde, ni écrasement de la désignation,
        // ni réactivation — toute modification d'un chantier se fait depuis l'UI.
        when(repository.existsByCodeIgnoreCase("c002")).thenReturn(true);

        boolean cree = operations.creerSiAbsent(new ChantierErpDto(2L, "Désignation modifiée côté ERP", "c002", 0));

        assertThat(cree).isFalse();
        verify(repository, never()).save(any(Chantier.class));
    }

    @Test
    void creerSiAbsent_devraitReussirMemeQuandCodeErreurEstNonNul() {
        when(repository.existsByCodeIgnoreCase("C004")).thenReturn(false);

        boolean cree = operations.creerSiAbsent(new ChantierErpDto(4L, "Chantier en erreur ERP", "C004", 5));

        assertThat(cree).isTrue();
    }
}

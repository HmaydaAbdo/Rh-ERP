package staport.rh.function.services;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import staport.rh.function.dtos.request.FunctionCreateRequestDto;
import staport.rh.function.dtos.request.FunctionUpdateRequestDto;
import staport.rh.function.dtos.response.FunctionResponseDto;
import staport.rh.function.entities.Function;
import staport.rh.function.exceptions.FunctionAlreadyExistsException;
import staport.rh.function.exceptions.FunctionNotFoundException;
import staport.rh.function.mappers.FunctionMapper;
import staport.rh.function.repositories.FunctionRepository;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FunctionServiceTest {

    @Mock
    private FunctionRepository repository;

    @Mock
    private FunctionMapper mapper;

    @InjectMocks
    private FunctionService functionService;

    private Function entity;

    @BeforeEach
    void setUp() {
        entity = new Function();
        entity.setId(1L);
        entity.setLibelle("CHEF CHANTIER");
    }

    @Test
    void create_devraitEnregistrerQuandLeLibelleEstUnique() {
        FunctionCreateRequestDto dto = new FunctionCreateRequestDto("CHEF CHANTIER");
        when(repository.existsByLibelleIgnoreCase("CHEF CHANTIER")).thenReturn(false);
        when(mapper.toEntity(dto)).thenReturn(entity);
        when(repository.save(entity)).thenReturn(entity);
        when(mapper.toDto(entity)).thenReturn(new FunctionResponseDto(1L, "CHEF CHANTIER"));

        FunctionResponseDto result = functionService.create(dto);

        assertThat(result.id()).isEqualTo(1L);
        assertThat(result.libelle()).isEqualTo("CHEF CHANTIER");
    }

    @Test
    void create_devraitEchouerQuandLeLibelleExisteDeja() {
        FunctionCreateRequestDto dto = new FunctionCreateRequestDto("CHEF CHANTIER");
        when(repository.existsByLibelleIgnoreCase("CHEF CHANTIER")).thenReturn(true);

        assertThatThrownBy(() -> functionService.create(dto))
                .isInstanceOf(FunctionAlreadyExistsException.class);

        verify(repository, never()).save(any());
    }

    @Test
    void findById_devraitLeverNotFoundQuandAbsent() {
        when(repository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> functionService.findById(99L))
                .isInstanceOf(FunctionNotFoundException.class);
    }

    @Test
    void update_devraitEchouerQuandLeNouveauLibelleAppartientAUneAutreFonction() {
        Function autre = new Function();
        autre.setId(2L);
        autre.setLibelle("MACON");

        FunctionUpdateRequestDto dto = new FunctionUpdateRequestDto("MACON");
        when(repository.findById(1L)).thenReturn(Optional.of(entity));
        when(repository.findByLibelleIgnoreCase("MACON")).thenReturn(Optional.of(autre));

        assertThatThrownBy(() -> functionService.update(1L, dto))
                .isInstanceOf(FunctionAlreadyExistsException.class);

        verify(repository, never()).save(any());
    }

    @Test
    void delete_devraitSupprimerQuandLaFonctionExiste() {
        when(repository.findById(1L)).thenReturn(Optional.of(entity));

        functionService.delete(1L);

        verify(repository).delete(entity);
    }
}

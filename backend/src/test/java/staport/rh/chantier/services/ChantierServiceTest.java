package staport.rh.chantier.services;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import staport.rh.chantier.entities.NatureChantier;
import org.mockito.junit.jupiter.MockitoExtension;
import staport.rh.chantier.dtos.request.ChantierCreateRequestDto;
import staport.rh.chantier.dtos.response.ChantierResponseDto;
import staport.rh.chantier.entities.Chantier;
import staport.rh.chantier.exceptions.ChantierAlreadyExistsException;
import staport.rh.chantier.exceptions.ChantierNotFoundException;
import staport.rh.chantier.mappers.ChantierMapper;
import staport.rh.chantier.repositories.ChantierRepository;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChantierServiceTest {

    @Mock
    private ChantierRepository repository;

    @Mock
    private ChantierMapper mapper;

    @Spy
    private LocalisationChantierService localisation = new LocalisationChantierService();

    @InjectMocks
    private ChantierService chantierService;

    private Chantier entity;

    @BeforeEach
    void setUp() {
        entity = new Chantier();
        entity.setId(1L);
        entity.setCode("C059");
        entity.setActif(true);
    }

    @Test
    void create_devraitEnregistrerQuandLeCodeEstUnique() {
        ChantierCreateRequestDto dto = new ChantierCreateRequestDto("C059", "Travaux de voirie", null, NatureChantier.AO, null, null, null, false);
        when(repository.existsByCodeIgnoreCase("C059")).thenReturn(false);
        when(mapper.toEntity(dto)).thenReturn(entity);
        when(repository.save(entity)).thenReturn(entity);
        when(mapper.toDto(entity)).thenReturn(new ChantierResponseDto(1L, 0L, "C059", "Travaux de voirie", null, false, true, NatureChantier.AO, null, null, null, false));

        ChantierResponseDto result = chantierService.create(dto);

        assertThat(result.id()).isEqualTo(1L);
        assertThat(result.code()).isEqualTo("C059");
    }

    @Test
    void create_devraitEchouerQuandLeCodeExisteDeja() {
        ChantierCreateRequestDto dto = new ChantierCreateRequestDto("C059", "Travaux de voirie", null, NatureChantier.AO, null, null, null, false);
        when(repository.existsByCodeIgnoreCase("C059")).thenReturn(true);

        assertThatThrownBy(() -> chantierService.create(dto))
                .isInstanceOf(ChantierAlreadyExistsException.class);

        verify(repository, never()).save(any());
    }

    @Test
    void findById_devraitLeverNotFoundQuandAbsent() {
        when(repository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> chantierService.findById(99L))
                .isInstanceOf(ChantierNotFoundException.class);
    }
}

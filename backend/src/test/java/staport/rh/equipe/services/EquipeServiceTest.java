package staport.rh.equipe.services;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import staport.rh.equipe.dtos.request.EquipeCreateRequestDto;
import staport.rh.equipe.dtos.request.EquipeUpdateRequestDto;
import staport.rh.equipe.dtos.response.EquipeResponseDto;
import staport.rh.equipe.entities.Equipe;
import staport.rh.equipe.exceptions.EquipeAlreadyExistsException;
import staport.rh.equipe.exceptions.EquipeNotFoundException;
import staport.rh.equipe.mappers.EquipeMapper;
import staport.rh.equipe.repositories.EquipeRepository;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class EquipeServiceTest {

    @Mock
    private EquipeRepository repository;

    @Mock
    private EquipeMapper mapper;

    @InjectMocks
    private EquipeService service;

    @Test
    void create_devraitNormaliserLeCodeEtEnregistrer() {
        EquipeCreateRequestDto dto = new EquipeCreateRequestDto(" ch ", " Chauffeurs ");
        Equipe entity = new Equipe();
        when(repository.findByCodeIgnoreCase("CH")).thenReturn(Optional.empty());
        when(repository.findByLibelleIgnoreCase("Chauffeurs")).thenReturn(Optional.empty());
        when(mapper.toEntity(dto)).thenReturn(entity);
        when(repository.save(entity)).thenReturn(entity);
        when(mapper.toDto(entity)).thenReturn(new EquipeResponseDto(1L, "CH", "Chauffeurs"));

        service.create(dto);

        ArgumentCaptor<Equipe> captor = ArgumentCaptor.forClass(Equipe.class);
        verify(repository).save(captor.capture());
        assertThat(captor.getValue().getCode()).isEqualTo("CH");
        assertThat(captor.getValue().getLibelle()).isEqualTo("Chauffeurs");
    }

    @Test
    void create_devraitRefuserUnCodeEnDoublonQuelleQueSoitLaCasse() {
        Equipe existante = new Equipe();
        existante.setId(1L);
        when(repository.findByCodeIgnoreCase("CH")).thenReturn(Optional.of(existante));

        assertThatThrownBy(() -> service.create(new EquipeCreateRequestDto("ch", "Autre libellé")))
                .isInstanceOf(EquipeAlreadyExistsException.class)
                .hasMessageContaining("code");

        verify(repository, never()).save(any());
    }

    @Test
    void create_devraitRefuserUnLibelleEnDoublon() {
        Equipe existante = new Equipe();
        existante.setId(1L);
        when(repository.findByCodeIgnoreCase("XX")).thenReturn(Optional.empty());
        when(repository.findByLibelleIgnoreCase("CHAUFFEURS")).thenReturn(Optional.of(existante));

        assertThatThrownBy(() -> service.create(new EquipeCreateRequestDto("XX", "CHAUFFEURS")))
                .isInstanceOf(EquipeAlreadyExistsException.class)
                .hasMessageContaining("libellé");

        verify(repository, never()).save(any());
    }

    @Test
    void update_devraitAutoriserLesMemesCodeEtLibelleSurLaMemeEquipe() {
        Equipe entity = new Equipe();
        entity.setId(1L);
        when(repository.findById(1L)).thenReturn(Optional.of(entity));
        when(repository.findByCodeIgnoreCase("CH")).thenReturn(Optional.of(entity));
        when(repository.findByLibelleIgnoreCase("CHAUFFEURS")).thenReturn(Optional.of(entity));
        when(repository.save(entity)).thenReturn(entity);
        when(mapper.toDto(entity)).thenReturn(new EquipeResponseDto(1L, "CH", "CHAUFFEURS"));

        service.update(1L, new EquipeUpdateRequestDto("CH", "CHAUFFEURS"));

        verify(repository).save(entity);
    }

    @Test
    void update_devraitRefuserLeCodeDUneAutreEquipe() {
        Equipe entity = new Equipe();
        entity.setId(1L);
        Equipe autre = new Equipe();
        autre.setId(2L);
        when(repository.findById(1L)).thenReturn(Optional.of(entity));
        when(repository.findByCodeIgnoreCase("OP")).thenReturn(Optional.of(autre));

        assertThatThrownBy(() -> service.update(1L, new EquipeUpdateRequestDto("OP", "OPERATEURS")))
                .isInstanceOf(EquipeAlreadyExistsException.class);

        verify(repository, never()).save(any());
    }

    @Test
    void findById_devraitLeverNotFoundQuandAbsente() {
        when(repository.findById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.findById(99L)).isInstanceOf(EquipeNotFoundException.class);
    }

    @Test
    void delete_devraitSupprimerQuandLEquipeExiste() {
        Equipe entity = new Equipe();
        when(repository.findById(1L)).thenReturn(Optional.of(entity));

        service.delete(1L);

        verify(repository).delete(entity);
    }
}

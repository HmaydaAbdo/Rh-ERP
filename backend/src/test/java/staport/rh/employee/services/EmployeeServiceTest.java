package staport.rh.employee.services;

import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import staport.rh.chantier.entities.Chantier;
import staport.rh.chantier.services.interfaces.IChantierService;
import staport.rh.employee.dtos.request.EmployeeCreateRequestDto;
import staport.rh.employee.dtos.request.EmployeeUpdateRequestDto;
import staport.rh.employee.dtos.response.EmployeeResponseDto;
import staport.rh.employee.entities.Employee;
import staport.rh.employee.entities.EmployeeStatut;
import staport.rh.employee.exceptions.CinAlreadyExistsException;
import staport.rh.employee.exceptions.EmployeeNotFoundException;
import staport.rh.employee.exceptions.InvalidReferenceException;
import staport.rh.employee.mappers.EmployeeMapper;
import staport.rh.employee.repositories.EmployeeRepository;
import staport.rh.employee.entities.TypeSalaire;
import staport.rh.equipe.entities.Equipe;
import staport.rh.equipe.services.interfaces.IEquipeService;
import staport.rh.function.entities.Function;
import staport.rh.function.services.interfaces.IFunctionService;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class EmployeeServiceTest {

    @Mock
    private EmployeeRepository repository;

    @Mock
    private EmployeeMapper mapper;

    @Mock
    private IFunctionService functionService;

    @Mock
    private IChantierService chantierService;

    @Mock
    private IEquipeService equipeService;

    @Mock
    private EntityManager entityManager;

    @InjectMocks
    private EmployeeService employeeService;

    private EmployeeCreateRequestDto createDto;
    private Employee entity;

    @BeforeEach
    void setUp() {
        createDto = new EmployeeCreateRequestDto(
                "BOULJIHEL SALH", "PB85747",
                LocalDate.of(1984, 5, 1), LocalDate.of(2018, 7, 14),
                10L, 20L, null, null, null
        );

        entity = new Employee();
        entity.setId(1L);
        ReflectionTestUtils.setField(entity, "version", 0L);
        entity.setNomPrenom("BOULJIHEL SALH");
        entity.setCin("PB85747");
    }

    @Test
    void create_devraitEnregistrerQuandLaFonctionEtLeChantierExistent() {
        Function fonction = new Function();
        fonction.setId(10L);
        Chantier chantier = new Chantier();
        chantier.setId(20L);

        when(repository.existsByCinIgnoreCase("PB85747")).thenReturn(false);
        when(mapper.toEntity(createDto)).thenReturn(entity);
        when(functionService.existsById(10L)).thenReturn(true);
        when(chantierService.existsById(20L)).thenReturn(true);
        when(entityManager.getReference(Function.class, 10L)).thenReturn(fonction);
        when(entityManager.getReference(Chantier.class, 20L)).thenReturn(chantier);
        when(repository.save(entity)).thenReturn(entity);
        when(mapper.toDto(entity)).thenReturn(new EmployeeResponseDto(
                1L, 0L, "BOULJIHEL SALH", "PB85747", createDto.dateNaissance(), createDto.dateEmbauche(),
                null, null, null, null, null, EmployeeStatut.ACTIF));

        EmployeeResponseDto result = employeeService.create(createDto);

        assertThat(result.id()).isEqualTo(1L);
        assertThat(entity.getFonction()).isEqualTo(fonction);
        assertThat(entity.getChantier()).isEqualTo(chantier);
    }

    @Test
    void create_devraitEchouerQuandLeCinExisteDeja() {
        when(repository.existsByCinIgnoreCase("PB85747")).thenReturn(true);

        assertThatThrownBy(() -> employeeService.create(createDto))
                .isInstanceOf(CinAlreadyExistsException.class);

        verify(repository, never()).save(any());
    }

    @Test
    void create_devraitEchouerQuandLaFonctionEstIntrouvable() {
        when(repository.existsByCinIgnoreCase("PB85747")).thenReturn(false);
        when(mapper.toEntity(createDto)).thenReturn(entity);
        when(functionService.existsById(10L)).thenReturn(false);

        assertThatThrownBy(() -> employeeService.create(createDto))
                .isInstanceOf(InvalidReferenceException.class);

        verify(repository, never()).save(any());
    }

    @Test
    void create_devraitEchouerQuandLeChantierEstIntrouvable() {
        when(repository.existsByCinIgnoreCase("PB85747")).thenReturn(false);
        when(mapper.toEntity(createDto)).thenReturn(entity);
        when(functionService.existsById(10L)).thenReturn(true);
        when(chantierService.existsById(20L)).thenReturn(false);

        assertThatThrownBy(() -> employeeService.create(createDto))
                .isInstanceOf(InvalidReferenceException.class);

        verify(repository, never()).save(any());
    }

    @Test
    void create_devraitRattacherLEquipeEtLeSalaireQuandIlsSontFournis() {
        EmployeeCreateRequestDto dto = new EmployeeCreateRequestDto("BOULJIHEL SALH", "PB85747",
                LocalDate.of(1984, 5, 1), LocalDate.of(2018, 7, 14), 10L, 20L, 30L, new BigDecimal("120.00"), TypeSalaire.JOURNALIER);
        Equipe equipe = new Equipe();
        when(repository.existsByCinIgnoreCase("PB85747")).thenReturn(false);
        when(mapper.toEntity(dto)).thenReturn(entity);
        when(functionService.existsById(10L)).thenReturn(true);
        when(chantierService.existsById(20L)).thenReturn(true);
        when(equipeService.existsById(30L)).thenReturn(true);
        when(entityManager.getReference(Function.class, 10L)).thenReturn(new Function());
        when(entityManager.getReference(Chantier.class, 20L)).thenReturn(new Chantier());
        when(entityManager.getReference(Equipe.class, 30L)).thenReturn(equipe);
        when(repository.save(entity)).thenReturn(entity);

        employeeService.create(dto);

        assertThat(entity.getEquipe()).isSameAs(equipe);
    }

    @Test
    void create_devraitEchouerQuandLEquipeEstIntrouvable() {
        EmployeeCreateRequestDto dto = new EmployeeCreateRequestDto("BOULJIHEL SALH", "PB85747",
                LocalDate.of(1984, 5, 1), LocalDate.of(2018, 7, 14), 10L, 20L, 30L, null, null);
        when(repository.existsByCinIgnoreCase("PB85747")).thenReturn(false);
        when(mapper.toEntity(dto)).thenReturn(entity);
        when(functionService.existsById(10L)).thenReturn(true);
        when(chantierService.existsById(20L)).thenReturn(true);
        when(equipeService.existsById(30L)).thenReturn(false);

        assertThatThrownBy(() -> employeeService.create(dto))
                .isInstanceOf(InvalidReferenceException.class)
                .hasMessageContaining("Équipe introuvable");

        verify(repository, never()).save(any());
    }

    @Test
    void create_devraitLaisserLEquipeVideQuandElleNEstPasFournie() {
        when(repository.existsByCinIgnoreCase("PB85747")).thenReturn(false);
        when(mapper.toEntity(createDto)).thenReturn(entity);
        when(functionService.existsById(10L)).thenReturn(true);
        when(chantierService.existsById(20L)).thenReturn(true);
        when(repository.save(entity)).thenReturn(entity);

        employeeService.create(createDto);

        assertThat(entity.getEquipe()).isNull();
        verify(equipeService, never()).existsById(any());
    }

    @Test
    void findById_devraitLeverNotFoundQuandAbsent() {
        when(repository.findWithReferencesById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> employeeService.findById(99L))
                .isInstanceOf(EmployeeNotFoundException.class);
    }

    @Test
    void update_devraitEchouerQuandLeCinAppartientAUnAutreEmploye() {
        Employee autre = new Employee();
        autre.setId(2L);
        autre.setCin("PB85747");

        EmployeeUpdateRequestDto dto = new EmployeeUpdateRequestDto(0L,
                "AUTRE NOM", "PB85747",
                LocalDate.of(1990, 1, 1), LocalDate.of(2020, 1, 1),
                10L, 20L, null, null, null, EmployeeStatut.ACTIF
        );

        when(repository.findById(1L)).thenReturn(Optional.of(entity));
        when(repository.findByCinIgnoreCase("PB85747")).thenReturn(Optional.of(autre));

        assertThatThrownBy(() -> employeeService.update(1L, dto))
                .isInstanceOf(CinAlreadyExistsException.class);

        verify(repository, never()).save(any());
    }

    @Test
    void delete_devraitSupprimerQuandLEmployeExiste() {
        when(repository.findById(1L)).thenReturn(Optional.of(entity));

        employeeService.delete(1L);

        verify(repository).delete(entity);
    }
}

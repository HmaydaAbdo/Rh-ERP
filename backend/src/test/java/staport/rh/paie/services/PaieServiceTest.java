package staport.rh.paie.services;

import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import staport.rh.chantier.entities.Chantier;
import staport.rh.chantier.services.interfaces.IChantierService;
import staport.rh.employee.entities.Employee;
import staport.rh.employee.services.interfaces.IEmployeeService;
import staport.rh.function.entities.Function;
import staport.rh.function.services.interfaces.IFunctionService;
import staport.rh.paie.dtos.request.PaieCreateRequestDto;
import staport.rh.paie.dtos.response.PaieResponseDto;
import staport.rh.paie.entities.Paie;
import staport.rh.paie.exceptions.InvalidReferenceException;
import staport.rh.paie.exceptions.PaieAlreadyExistsException;
import staport.rh.paie.exceptions.PaieNotFoundException;
import staport.rh.paie.mappers.PaieMapper;
import staport.rh.paie.repositories.PaieRepository;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PaieServiceTest {

    @Mock
    private PaieRepository repository;

    @Mock
    private PaieMapper mapper;

    @Mock
    private IEmployeeService employeeService;

    @Mock
    private IFunctionService functionService;

    @Mock
    private IChantierService chantierService;

    @Mock
    private EntityManager entityManager;

    @InjectMocks
    private PaieService paieService;

    private PaieCreateRequestDto createDto;
    private Paie entity;

    @BeforeEach
    void setUp() {
        createDto = new PaieCreateRequestDto(
                1L, YearMonth.of(2026, 8), 10L, 20L, "EQUIPE A",
                26, BigDecimal.ZERO, BigDecimal.ZERO,
                new BigDecimal("5000"), new BigDecimal("200"), new BigDecimal("100"),
                null
        );

        entity = new Paie();
        entity.setId(1L);
        // Le mapper réel copierait ces champs depuis le DTO ; ici mocké, on les reproduit à la main
        // pour que calculerSalaireTotal() (appelé par le service) ne rencontre pas un salaireMensuel nul.
        entity.setSalaireMensuel(new BigDecimal("5000"));
        entity.setPrimeRoulageOrdinaire(new BigDecimal("200"));
        entity.setPrimeRoulageDimanche(new BigDecimal("100"));
    }

    @Test
    void create_devraitEnregistrerQuandToutEstValide() {
        when(employeeService.existsById(1L)).thenReturn(true);
        when(repository.existsByEmployee_IdAndPeriode(1L, createDto.periode())).thenReturn(false);
        when(mapper.toEntity(createDto)).thenReturn(entity);
        when(functionService.existsById(10L)).thenReturn(true);
        when(chantierService.existsById(20L)).thenReturn(true);
        when(entityManager.getReference(Employee.class, 1L)).thenReturn(new Employee());
        when(entityManager.getReference(Function.class, 10L)).thenReturn(new Function());
        when(entityManager.getReference(Chantier.class, 20L)).thenReturn(new Chantier());
        when(repository.save(entity)).thenReturn(entity);
        when(mapper.toDto(entity)).thenReturn(mockResponseDto());

        PaieResponseDto result = paieService.create(createDto);

        assertThat(result.id()).isEqualTo(1L);
    }

    @Test
    void create_devraitEchouerQuandLEmployeEstIntrouvable() {
        when(employeeService.existsById(1L)).thenReturn(false);

        assertThatThrownBy(() -> paieService.create(createDto))
                .isInstanceOf(InvalidReferenceException.class);

        verify(repository, never()).save(any());
    }

    @Test
    void create_devraitEchouerQuandUnBulletinExisteDejaPourLaPeriode() {
        when(employeeService.existsById(1L)).thenReturn(true);
        when(repository.existsByEmployee_IdAndPeriode(1L, createDto.periode())).thenReturn(true);

        assertThatThrownBy(() -> paieService.create(createDto))
                .isInstanceOf(PaieAlreadyExistsException.class);

        verify(repository, never()).save(any());
    }

    @Test
    void create_devraitEchouerQuandLaFonctionEstIntrouvable() {
        when(employeeService.existsById(1L)).thenReturn(true);
        when(repository.existsByEmployee_IdAndPeriode(1L, createDto.periode())).thenReturn(false);
        when(mapper.toEntity(createDto)).thenReturn(entity);
        when(entityManager.getReference(eq(Employee.class), any())).thenReturn(new Employee());
        when(functionService.existsById(10L)).thenReturn(false);

        assertThatThrownBy(() -> paieService.create(createDto))
                .isInstanceOf(InvalidReferenceException.class);

        verify(repository, never()).save(any());
    }

    @Test
    void findById_devraitLeverNotFoundQuandAbsent() {
        when(repository.findWithReferencesById(99L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> paieService.findById(99L))
                .isInstanceOf(PaieNotFoundException.class);
    }

    @Test
    void delete_devraitSupprimerQuandLeBulletinExiste() {
        when(repository.findById(1L)).thenReturn(Optional.of(entity));

        paieService.delete(1L);

        verify(repository).delete(entity);
    }

    private PaieResponseDto mockResponseDto() {
        return new PaieResponseDto(1L, null, createDto.periode(), null, null, "EQUIPE A",
                26, BigDecimal.ZERO, BigDecimal.ZERO, new BigDecimal("5000"),
                new BigDecimal("200"), new BigDecimal("100"), new BigDecimal("5300"), null);
    }
}

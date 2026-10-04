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
import staport.rh.equipe.entities.Equipe;
import staport.rh.equipe.services.interfaces.IEquipeService;
import staport.rh.function.entities.Function;
import staport.rh.function.services.interfaces.IFunctionService;
import staport.rh.paie.dtos.request.PaieCreateRequestDto;
import staport.rh.paie.dtos.response.EquipeSummaryDto;
import staport.rh.paie.dtos.response.PaieChantierPeriodeDto;
import staport.rh.paie.dtos.response.PaieEquipePeriodeDto;
import staport.rh.paie.dtos.response.PaiePeriodeResumeDto;
import staport.rh.paie.dtos.response.PaieResponseDto;
import staport.rh.paie.entities.Paie;
import staport.rh.paie.exceptions.InvalidReferenceException;
import staport.rh.paie.exceptions.PaieAlreadyExistsException;
import staport.rh.paie.exceptions.PaieNotFoundException;
import staport.rh.paie.mappers.PaieMapper;
import staport.rh.paie.repositories.ChantierEquipePeriodeProjection;
import staport.rh.paie.repositories.PaiePeriodeProjection;
import staport.rh.paie.repositories.PaieRepository;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
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
    private IEquipeService equipeService;

    @Mock
    private EntityManager entityManager;

    @InjectMocks
    private PaieService paieService;

    private PaieCreateRequestDto createDto;
    private Paie entity;

    @BeforeEach
    void setUp() {
        createDto = new PaieCreateRequestDto(
                1L, YearMonth.of(2026, 8), 10L, 20L, 30L,
                26, BigDecimal.ZERO, BigDecimal.ZERO,
                new BigDecimal("5000"), new BigDecimal("200"), new BigDecimal("100"), new BigDecimal("5300"),
                null
        );

        entity = new Paie();
        entity.setId(1L);
        // Le mapper réel copierait ces champs depuis le DTO ; ici mocké, on les reproduit à la main
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
        when(equipeService.existsById(30L)).thenReturn(true);
        when(entityManager.getReference(Employee.class, 1L)).thenReturn(new Employee());
        when(entityManager.getReference(Function.class, 10L)).thenReturn(new Function());
        when(entityManager.getReference(Chantier.class, 20L)).thenReturn(new Chantier());
        Equipe equipe = new Equipe();
        when(entityManager.getReference(Equipe.class, 30L)).thenReturn(equipe);
        when(repository.save(entity)).thenReturn(entity);
        when(mapper.toDto(entity)).thenReturn(mockResponseDto());

        PaieResponseDto result = paieService.create(createDto);

        assertThat(result.id()).isEqualTo(1L);
        assertThat(entity.getEquipe()).isSameAs(equipe);
    }

    @Test
    void create_devraitAccepterUnBulletinSansEquipe() {
        PaieCreateRequestDto sansEquipe = new PaieCreateRequestDto(
                1L, YearMonth.of(2026, 8), 10L, 20L, null,
                26, BigDecimal.ZERO, BigDecimal.ZERO,
                new BigDecimal("5000"), new BigDecimal("200"), new BigDecimal("100"), new BigDecimal("5300"),
                null);
        when(employeeService.existsById(1L)).thenReturn(true);
        when(repository.existsByEmployee_IdAndPeriode(1L, sansEquipe.periode())).thenReturn(false);
        when(mapper.toEntity(sansEquipe)).thenReturn(entity);
        when(functionService.existsById(10L)).thenReturn(true);
        when(chantierService.existsById(20L)).thenReturn(true);
        when(entityManager.getReference(Employee.class, 1L)).thenReturn(new Employee());
        when(entityManager.getReference(Function.class, 10L)).thenReturn(new Function());
        when(entityManager.getReference(Chantier.class, 20L)).thenReturn(new Chantier());
        when(repository.save(entity)).thenReturn(entity);
        when(mapper.toDto(entity)).thenReturn(mockResponseDto());

        paieService.create(sansEquipe);

        assertThat(entity.getEquipe()).isNull();
        verify(equipeService, never()).existsById(any());
    }

    @Test
    void create_devraitEchouerQuandLEquipeEstIntrouvable() {
        when(employeeService.existsById(1L)).thenReturn(true);
        when(repository.existsByEmployee_IdAndPeriode(1L, createDto.periode())).thenReturn(false);
        when(mapper.toEntity(createDto)).thenReturn(entity);
        when(functionService.existsById(10L)).thenReturn(true);
        when(chantierService.existsById(20L)).thenReturn(true);
        when(entityManager.getReference(Employee.class, 1L)).thenReturn(new Employee());
        when(entityManager.getReference(Function.class, 10L)).thenReturn(new Function());
        when(entityManager.getReference(Chantier.class, 20L)).thenReturn(new Chantier());
        when(equipeService.existsById(30L)).thenReturn(false);

        assertThatThrownBy(() -> paieService.create(createDto))
                .isInstanceOf(InvalidReferenceException.class);

        verify(repository, never()).save(any());
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

    @Test
    void findPeriodes_devraitRenvoyerLesMoisAvecLeurContenu() {
        PaiePeriodeProjection aout = periode(YearMonth.of(2026, 8), 969L, 25L, "4399080.74", 37L);
        PaiePeriodeProjection juillet = periode(YearMonth.of(2026, 7), 958L, 24L, "4352774.10", 29L);
        List<PaiePeriodeProjection> projections = List.of(aout, juillet);
        when(repository.resumerParPeriode()).thenReturn(projections);

        List<PaiePeriodeResumeDto> resultat = paieService.findPeriodes();

        assertThat(resultat).extracting(PaiePeriodeResumeDto::periode).containsExactly("2026-08", "2026-07");
        assertThat(resultat.get(0).nombreBulletins()).isEqualTo(969);
        assertThat(resultat.get(0).nombreChantiers()).isEqualTo(25);
        assertThat(resultat.get(0).masse()).isEqualByComparingTo("4399080.74");
        assertThat(resultat.get(0).stc()).isEqualTo(37);
    }

    @Test
    void findChantiersDeLaPeriode_devraitGrouperParChantierEtTrierParMasseDecroissante() {
        YearMonth periode = YearMonth.of(2026, 8);
        List<ChantierEquipePeriodeProjection> lignes = List.of(
                ligne("C057", "DEPOT HARBIL", null, 3L, "OP", "OPERATEURS", 40L, "100000"),
                ligne("C168", "NADOR", null, 2L, "OP", "OPERATEURS", 69L, "300000"),
                ligne("C168", "NADOR", null, 1L, "CH", "CHAUFFEURS", 74L, "400000"),
                ligne("C168", "NADOR", null, null, null, null, 5L, "20000"));
        when(repository.resumerChantiersEtEquipesParPeriode(periode)).thenReturn(lignes);

        List<PaieChantierPeriodeDto> resultat = paieService.findChantiersDeLaPeriode(periode);

        assertThat(resultat).extracting(PaieChantierPeriodeDto::code).containsExactly("C168", "C057");
        PaieChantierPeriodeDto c168 = resultat.get(0);
        // L'effectif du chantier compte aussi les bulletins sans équipe ; la liste des équipes, non.
        assertThat(c168.effectif()).isEqualTo(148);
        assertThat(c168.masse()).isEqualByComparingTo("720000");
        assertThat(c168.equipes()).extracting(PaieEquipePeriodeDto::code).containsExactly("CH", "OP");
        assertThat(c168.equipes()).extracting(PaieEquipePeriodeDto::effectif).containsExactly(74L, 69L);
        // La masse de chaque équipe permet de déduire celle des bulletins sans équipe (720000 - 400000 - 300000).
        assertThat(c168.equipes()).extracting(PaieEquipePeriodeDto::masse)
                .usingElementComparator(BigDecimal::compareTo)
                .containsExactly(new BigDecimal("400000"), new BigDecimal("300000"));
    }

    @Test
    void findChantiersDeLaPeriode_devraitPrivilegierLeNomDuChantierSurSaDesignation() {
        YearMonth periode = YearMonth.of(2026, 8);
        List<ChantierEquipePeriodeProjection> lignes = List.of(
                ligne("C168", "NADOR", "Désignation ERP", null, null, null, 1L, "1000"),
                ligne("C196", null, "Désignation ERP 196", null, null, null, 1L, "500"));
        when(repository.resumerChantiersEtEquipesParPeriode(periode)).thenReturn(lignes);

        List<PaieChantierPeriodeDto> resultat = paieService.findChantiersDeLaPeriode(periode);

        assertThat(resultat).extracting(PaieChantierPeriodeDto::libelle).containsExactly("NADOR", "Désignation ERP 196");
    }

    private PaiePeriodeProjection periode(YearMonth periode, Long bulletins, Long chantiers, String masse, Long stc) {
        PaiePeriodeProjection projection = mock(PaiePeriodeProjection.class);
        when(projection.getPeriode()).thenReturn(periode);
        when(projection.getBulletins()).thenReturn(bulletins);
        when(projection.getChantiers()).thenReturn(chantiers);
        when(projection.getMasse()).thenReturn(new BigDecimal(masse));
        when(projection.getStc()).thenReturn(stc);
        return projection;
    }

    private ChantierEquipePeriodeProjection ligne(String code, String nom, String designation, Long equipeId,
                                                   String equipeCode, String equipeLibelle, Long effectif, String masse) {
        ChantierEquipePeriodeProjection projection = mock(ChantierEquipePeriodeProjection.class);
        lenient().when(projection.getChantierCode()).thenReturn(code);
        lenient().when(projection.getChantierNom()).thenReturn(nom);
        lenient().when(projection.getChantierDesignation()).thenReturn(designation);
        lenient().when(projection.getEquipeId()).thenReturn(equipeId);
        lenient().when(projection.getEquipeCode()).thenReturn(equipeCode);
        lenient().when(projection.getEquipeLibelle()).thenReturn(equipeLibelle);
        lenient().when(projection.getEffectif()).thenReturn(effectif);
        lenient().when(projection.getMasse()).thenReturn(new BigDecimal(masse));
        return projection;
    }

    private PaieResponseDto mockResponseDto() {
        return new PaieResponseDto(1L, null, createDto.periode(), null, null,
                new EquipeSummaryDto(30L, "EQUIPE A", "Equipe A"),
                26, BigDecimal.ZERO, BigDecimal.ZERO, new BigDecimal("5000"),
                new BigDecimal("200"), new BigDecimal("100"), new BigDecimal("5300"), null);
    }
}

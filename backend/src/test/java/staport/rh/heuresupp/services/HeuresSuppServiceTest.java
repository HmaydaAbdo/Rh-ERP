package staport.rh.heuresupp.services;

import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.test.util.ReflectionTestUtils;
import staport.rh.chantier.entities.Chantier;
import staport.rh.chantier.services.interfaces.IChantierService;
import staport.rh.employee.dtos.response.EmployeeResponseDto;
import staport.rh.employee.dtos.response.FunctionSummaryDto;
import staport.rh.employee.entities.Employee;
import staport.rh.employee.entities.TypeSalaire;
import staport.rh.employee.services.interfaces.IEmployeeService;
import staport.rh.function.entities.Function;
import staport.rh.heuresupp.dtos.request.HeuresSuppCreationDto;
import staport.rh.heuresupp.dtos.request.HeuresSuppModificationDto;
import staport.rh.heuresupp.dtos.request.HeuresSuppSearchCriteria;
import staport.rh.heuresupp.dtos.response.HeureSuppResponseDto;
import staport.rh.heuresupp.entities.HeureSupp;
import staport.rh.heuresupp.exceptions.HeuresSuppGroupeModifieException;
import staport.rh.heuresupp.imports.HeuresSuppImportException;
import staport.rh.heuresupp.mappers.HeuresSuppMapper;
import staport.rh.heuresupp.repositories.HeuresSuppRepository;
import staport.rh.paie.dtos.response.PaieResponseDto;
import staport.rh.paie.entities.Paie;
import staport.rh.paie.services.interfaces.IPaieService;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class HeuresSuppServiceTest {

    private static final YearMonth PERIODE = YearMonth.of(2026, 10);
    private static final HeureSuppResponseDto DTO = mock(HeureSuppResponseDto.class);
    @Mock private HeuresSuppRepository repository;
    @Mock private HeuresSuppMapper mapper;
    @Mock private EntityManager entityManager;
    @Mock private IEmployeeService employes;
    @Mock private IPaieService paies;
    @Mock private IChantierService chantiers;

    private HeuresSuppService service;
    private EmployeeResponseDto employe;
    private PaieResponseDto paie;

    @BeforeEach
    void setUp() {
        service = new HeuresSuppService(repository, mapper, entityManager, employes, paies, chantiers);
        employe = new EmployeeResponseDto(5L, 0L, "Salma Alaoui", "AB123", null, null,
                new FunctionSummaryDto(7L, "Chauffeur"), null, null, new BigDecimal("1000"), TypeSalaire.JOURNALIER, null);
        paie = mock(PaieResponseDto.class);
        lenient().when(paie.id()).thenReturn(9L);
        lenient().when(paie.periode()).thenReturn(PERIODE);
        lenient().when(paie.fonction()).thenReturn(new staport.rh.paie.dtos.response.FunctionSummaryDto(7L, "Chauffeur"));
        lenient().when(paie.observation()).thenReturn("");
        lenient().when(employes.findById(5L)).thenReturn(employe);
        lenient().when(paies.findByEmployeeIdAndPeriode(5L, PERIODE)).thenReturn(Optional.of(paie));
        lenient().when(chantiers.existsById(8L)).thenReturn(true);
        lenient().when(repository.save(any(HeureSupp.class))).thenAnswer(invocation -> invocation.getArgument(0));
        lenient().when(mapper.toDto(any(HeureSupp.class))).thenReturn(DTO);
    }

    @Test
    void creerCalculeEtFigeLesDonneesDeReference() {
        when(repository.existsByEmployee_IdAndPeriodeAndChantier_Id(5L, PERIODE, 8L)).thenReturn(false);
        when(entityManager.getReference(Employee.class, 5L)).thenReturn(mock(Employee.class));
        when(entityManager.getReference(Paie.class, 9L)).thenReturn(mock(Paie.class));
        when(entityManager.getReference(Function.class, 7L)).thenReturn(mock(Function.class));
        when(entityManager.getReference(Chantier.class, 8L)).thenReturn(mock(Chantier.class));

        assertSame(DTO, service.creer(new HeuresSuppCreationDto(5L, PERIODE, 8L, new BigDecimal("2.5"), new BigDecimal("15"))));

        var ligne = capturerLigneSauvee();
        assertEquals(0, new BigDecimal("100").compareTo(ligne.getSalaireHoraire()));
        assertEquals(new BigDecimal("250.00"), ligne.getMontant());
        assertEquals(new BigDecimal("265.00"), ligne.getNetAPayer());
        assertFalse(ligne.isStcOuSortie());
        assertEquals(PERIODE, ligne.getPeriode());
    }

    @Test
    void creerRefuseValeursVidesPaieAbsenteChantierAbsentEtDoublon() {
        assertThrows(HeuresSuppImportException.class, () -> service.creer(new HeuresSuppCreationDto(5L, PERIODE, 8L, null, null)));
        verifyNoInteractions(employes);

        when(paies.findByEmployeeIdAndPeriode(5L, PERIODE)).thenReturn(Optional.empty());
        assertThrows(HeuresSuppImportException.class, () -> service.creer(new HeuresSuppCreationDto(5L, PERIODE, 8L, BigDecimal.ONE, null)));
        when(paies.findByEmployeeIdAndPeriode(5L, PERIODE)).thenReturn(Optional.of(paie));

        when(chantiers.existsById(8L)).thenReturn(false);
        assertThrows(HeuresSuppImportException.class, () -> service.creer(new HeuresSuppCreationDto(5L, PERIODE, 8L, BigDecimal.ONE, null)));
        when(chantiers.existsById(8L)).thenReturn(true);
        when(repository.existsByEmployee_IdAndPeriodeAndChantier_Id(5L, PERIODE, 8L)).thenReturn(true);
        assertThrows(HeuresSuppImportException.class, () -> service.creer(new HeuresSuppCreationDto(5L, PERIODE, 8L, BigDecimal.ONE, null)));
    }

    @Test
    void creerRefuseForfaitStcEtForfaitStcDejaLieAutreChantier() {
        when(paie.observation()).thenReturn("STC");
        when(repository.existsByEmployee_IdAndPeriodeAndChantier_Id(5L, PERIODE, 8L)).thenReturn(false);
        assertThrows(HeuresSuppImportException.class, () -> service.creer(new HeuresSuppCreationDto(5L, PERIODE, 8L, BigDecimal.ONE, BigDecimal.TEN)));

        when(repository.existsByEmployee_IdAndPeriodeAndForfaitIsNotNullAndChantier_IdNot(5L, PERIODE, 8L)).thenReturn(true);
        assertThrows(HeuresSuppImportException.class, () -> service.creer(new HeuresSuppCreationDto(5L, PERIODE, 8L, BigDecimal.ONE, null)));
    }

    @Test
    void modifierVerifieVersionPuisRecalculeEtPermetForfaitSeul() {
        HeureSupp ligne = ligneExistante(3L, new BigDecimal("100"), false);
        when(repository.findById(4L)).thenReturn(Optional.of(ligne));
        when(repository.save(ligne)).thenReturn(ligne);

        service.modifier(4L, new HeuresSuppModificationDto(3L, new BigDecimal("3"), new BigDecimal("10")));
        assertEquals(new BigDecimal("300.00"), ligne.getMontant());
        assertEquals(new BigDecimal("310.00"), ligne.getNetAPayer());

        service.modifier(4L, new HeuresSuppModificationDto(3L, null, new BigDecimal("10")));
        assertNull(ligne.getSalaireReference());
        assertNull(ligne.getTypeSalaireReference());
        assertNull(ligne.getSalaireHoraire());
        assertEquals(new BigDecimal("10.00"), ligne.getNetAPayer());
    }

    @Test
    void modifierRefuseLigneAbsenteVersionPerimeeSaisieVideStcEtTauxAbsent() {
        when(repository.findById(4L)).thenReturn(Optional.empty());
        assertThrows(HeuresSuppImportException.class, () -> service.modifier(4L, new HeuresSuppModificationDto(1L, BigDecimal.ONE, null)));

        HeureSupp ligne = ligneExistante(3L, null, false);
        when(repository.findById(4L)).thenReturn(Optional.of(ligne));
        assertThrows(HeuresSuppImportException.class, () -> service.modifier(4L, new HeuresSuppModificationDto(2L, BigDecimal.ONE, null)));
        assertThrows(HeuresSuppImportException.class, () -> service.modifier(4L, new HeuresSuppModificationDto(3L, null, null)));
        assertThrows(HeuresSuppImportException.class, () -> service.modifier(4L, new HeuresSuppModificationDto(3L, BigDecimal.ONE, null)));

        HeureSupp stc = ligneExistante(3L, BigDecimal.TEN, true);
        when(repository.findById(4L)).thenReturn(Optional.of(stc));
        assertThrows(HeuresSuppImportException.class, () -> service.modifier(4L, new HeuresSuppModificationDto(3L, null, BigDecimal.TEN)));
    }

    @Test
    void supprimerEtPurgerControleExistenceNombreConfirmeEtMois() {
        HeureSupp ligne = ligneExistante(1L, BigDecimal.TEN, false);
        when(repository.findById(4L)).thenReturn(Optional.of(ligne));
        service.supprimer(4L);
        verify(repository).delete(ligne);
        when(repository.findById(5L)).thenReturn(Optional.empty());
        assertThrows(HeuresSuppImportException.class, () -> service.supprimer(5L));

        assertThrows(HeuresSuppImportException.class, () -> service.supprimerMois(null, 0));
        assertThrows(HeuresSuppImportException.class, () -> service.supprimerMois(PERIODE, -1));
        when(repository.findByPeriodeOrderByEmployee_NomPrenomAsc(PERIODE)).thenReturn(List.of(ligne));
        assertThrows(HeuresSuppGroupeModifieException.class, () -> service.supprimerMois(PERIODE, 2));
        assertEquals(1, service.supprimerMois(PERIODE, 1));
        verify(repository).deleteAll(List.of(ligne));
    }

    @Test
    void rechercherMappeLaPageDeLignes() {
        HeureSupp ligne = ligneExistante(1L, BigDecimal.TEN, false);
        when(repository.findAll(any(Specification.class), any(PageRequest.class))).thenReturn(new PageImpl<>(List.of(ligne)));
        var page = service.rechercher(new HeuresSuppSearchCriteria(PERIODE, null, null, null, null, null), PageRequest.of(0, 20));
        assertEquals(1, page.getTotalElements());
        verify(mapper).toDto(ligne);
    }

    private HeureSupp ligneExistante(long version, BigDecimal taux, boolean stc) {
        HeureSupp ligne = new HeureSupp();
        ReflectionTestUtils.setField(ligne, "version", version);
        ligne.setSalaireHoraire(taux);
        ligne.setStcOuSortie(stc);
        return ligne;
    }

    private HeureSupp capturerLigneSauvee() {
        var captor = org.mockito.ArgumentCaptor.forClass(HeureSupp.class);
        verify(repository).save(captor.capture());
        return captor.getValue();
    }
}

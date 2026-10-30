package staport.rh.heuresupp.imports;

import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import staport.rh.chantier.entities.Chantier;
import staport.rh.chantier.services.interfaces.IChantierService;
import staport.rh.employee.dtos.response.EmployeeResponseDto;
import staport.rh.employee.dtos.response.FunctionSummaryDto;
import staport.rh.employee.entities.Employee;
import staport.rh.employee.entities.EmployeeStatut;
import staport.rh.employee.entities.TypeSalaire;
import staport.rh.employee.services.interfaces.IEmployeeService;
import staport.rh.function.entities.Function;
import staport.rh.function.services.interfaces.IFunctionService;
import staport.rh.heuresupp.entities.HeureSupp;
import staport.rh.heuresupp.repositories.HeuresSuppRepository;
import staport.rh.paie.dtos.response.PaiePeriodeResumeDto;
import staport.rh.paie.dtos.response.PaieResponseDto;
import staport.rh.paie.entities.Paie;
import staport.rh.paie.services.interfaces.IPaieService;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class HeuresSuppImportServiceTest {

    private static final YearMonth MOIS = YearMonth.of(2026, 10);
    private static final Long CHANTIER_ID = 22L;
    private static final Long EMPLOYE_ID = 12L;
    private static final String CIN = "AB123";

    @Mock private LecteurFichierHeuresSupp lecteur;
    @Mock private HeuresSuppRepository repository;
    @Mock private IEmployeeService employes;
    @Mock private IPaieService paie;
    @Mock private IChantierService chantiers;
    @Mock private IFunctionService fonctions;
    @Mock private EntityManager entityManager;

    private HeuresSuppImportService service;
    private final MockMultipartFile fichier = new MockMultipartFile("file", "heures.xlsx", "application/octet-stream", new byte[]{1});

    @BeforeEach
    void setUp() {
        service = new HeuresSuppImportService(lecteur, repository, employes, paie, chantiers, fonctions, entityManager);
    }

    @Test
    void bloque_le_wizard_si_le_mois_ne_contient_aucune_paie() {
        when(paie.findPeriodes(null)).thenReturn(List.of());

        var prerequis = service.verifierPrerequis(MOIS, CHANTIER_ID);

        assertThat(prerequis.pret()).isFalse();
        assertThat(prerequis.message()).contains("Importez d'abord la paie");
        verify(chantiers, never()).existsById(any());
    }

    @Test
    void bloque_si_le_chantier_a_disparu() {
        paiePresente();
        when(chantiers.existsById(CHANTIER_ID)).thenReturn(false);

        var prerequis = service.verifierPrerequis(MOIS, CHANTIER_ID);

        assertThat(prerequis.pret()).isFalse();
        assertThat(prerequis.message()).contains("n'existe plus");
    }

    @Test
    void analyse_et_calcule_le_taux_mensuel_sans_ecrire() {
        paiePresente();
        when(lecteur.lire(fichier)).thenReturn(classeur("2.5"));
        when(employes.findByCin(CIN)).thenReturn(Optional.of(employe()));
        when(paie.findByEmployeeIdAndPeriode(EMPLOYE_ID, MOIS)).thenReturn(Optional.of(bulletin("Présence")));
        when(repository.existsByEmployee_IdAndPeriodeAndChantier_Id(EMPLOYE_ID, MOIS, CHANTIER_ID)).thenReturn(false);

        HeuresSuppImportAnalyseDto analyse = service.analyser(fichier, MOIS, CHANTIER_ID, null);

        assertThat(analyse.pret()).isTrue();
        assertThat(analyse.lignesZero()).isZero();
        assertThat(analyse.lignes()).singleElement().satisfies(ligne -> {
            assertThat(ligne.salaireHoraireDh()).isEqualByComparingTo("15.38461538461538461538");
            assertThat(ligne.montantDh()).isEqualByComparingTo("38.46");
            assertThat(ligne.stcDh()).isEqualByComparingTo("0.00");
            assertThat(ligne.netAPayerDh()).isEqualByComparingTo("38.46");
        });
        verify(repository, never()).saveAll(any());
    }

    @Test
    void conserve_une_ligne_zero_avec_un_montant_nul() {
        paiePresente();
        var zero = new LigneFichierHeuresSupp(2, "Alaoui Salma", CIN, BigDecimal.ZERO);
        when(lecteur.lire(fichier)).thenReturn(new FichierHeuresSupp(List.of(zero), 1, 1));
        when(employes.findByCin(CIN)).thenReturn(Optional.of(employe()));
        when(paie.findByEmployeeIdAndPeriode(EMPLOYE_ID, MOIS)).thenReturn(Optional.of(bulletin("Présence")));

        var analyse = service.analyser(fichier, MOIS, CHANTIER_ID, null);

        assertThat(analyse.lignesZero()).isEqualTo(1);
        assertThat(analyse.lignes()).singleElement().satisfies(ligne -> {
            assertThat(ligne.heuresSupplementaires()).isEqualByComparingTo("0");
            assertThat(ligne.montantDh()).isEqualByComparingTo("0");
            assertThat(ligne.stcDh()).isEqualByComparingTo("0");
            assertThat(ligne.netAPayerDh()).isEqualByComparingTo("0");
        });
        verify(repository, never()).saveAll(any());
    }

    @Test
    void le_stc_du_meme_mois_annule_le_montant_et_refuse_le_forfait() {
        paiePresente();
        when(lecteur.lire(fichier)).thenReturn(classeur("2"));
        when(employes.findByCin(CIN)).thenReturn(Optional.of(employe()));
        when(paie.findByEmployeeIdAndPeriode(EMPLOYE_ID, MOIS)).thenReturn(Optional.of(bulletin("STC")));
        var forfaits = new HeuresSuppImportForfaitsDto(List.of(new HeuresSuppImportForfaitsDto.Forfait(CIN, new BigDecimal("500"))));

        HeuresSuppImportAnalyseDto analyse = service.analyser(fichier, MOIS, CHANTIER_ID, forfaits);

        assertThat(analyse.pret()).isFalse();
        assertThat(analyse.erreurs()).anyMatch(erreur -> erreur.contains("forfait est interdit"));
        assertThat(analyse.lignes().getFirst().stcDh()).isEqualByComparingTo(analyse.lignes().getFirst().montantDh());
    }

    @Test
    void refuse_l_import_si_l_employe_n_a_pas_de_bulletin_du_mois() {
        paiePresente();
        when(lecteur.lire(fichier)).thenReturn(classeur("2"));
        when(employes.findByCin(CIN)).thenReturn(Optional.of(employe()));
        when(paie.findByEmployeeIdAndPeriode(EMPLOYE_ID, MOIS)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.importer(fichier, MOIS, CHANTIER_ID, null))
                .isInstanceOf(HeuresSuppImportException.class).hasMessageContaining("bulletin de paie");
        verify(repository, never()).saveAll(any());
    }

    @Test
    void importe_les_montants_figes_et_retourne_le_recapitulatif() {
        paiePresente();
        when(lecteur.lire(fichier)).thenReturn(classeur("2"));
        when(employes.findByCin(CIN)).thenReturn(Optional.of(employe()));
        when(paie.findByEmployeeIdAndPeriode(EMPLOYE_ID, MOIS)).thenReturn(Optional.of(bulletin("Présence")));
        when(repository.existsByEmployee_IdAndPeriodeAndChantier_Id(EMPLOYE_ID, MOIS, CHANTIER_ID)).thenReturn(false);
        when(entityManager.getReference(eq(Employee.class), eq(EMPLOYE_ID))).thenReturn(new Employee());
        when(entityManager.getReference(eq(Paie.class), eq(90L))).thenReturn(new Paie());
        when(entityManager.getReference(eq(Function.class), eq(17L))).thenReturn(new Function());
        when(entityManager.getReference(eq(Chantier.class), eq(CHANTIER_ID))).thenReturn(new Chantier());

        var resultat = service.importer(fichier, MOIS, CHANTIER_ID, null);

        assertThat(resultat.lignesHeures()).isEqualTo(1);
        assertThat(resultat.lignesZero()).isZero();
        assertThat(resultat.heuresTotales()).isEqualByComparingTo("2");
        assertThat(resultat.montantTotalDh()).isEqualByComparingTo("30.77");
        assertThat(resultat.netTotalDh()).isEqualByComparingTo("30.77");
        ArgumentCaptor<List<HeureSupp>> lignes = ArgumentCaptor.forClass(List.class);
        verify(repository).saveAll(lignes.capture());
        assertThat(lignes.getValue()).singleElement().satisfies(ligne -> {
            assertThat(ligne.getSalaireHoraire()).isEqualByComparingTo("15.38461538461538461538");
            assertThat(ligne.getMontant()).isEqualByComparingTo("30.77");
            assertThat(ligne.getPaie()).isNotNull();
        });
    }

    @Test
    void refuse_un_forfait_en_double_dans_le_lot_apres_normalisation_du_cin() {
        paiePresente();
        when(lecteur.lire(fichier)).thenReturn(classeur("2"));
        var forfaits = new HeuresSuppImportForfaitsDto(List.of(
                new HeuresSuppImportForfaitsDto.Forfait("ab123", new BigDecimal("100")),
                new HeuresSuppImportForfaitsDto.Forfait(" AB123 ", new BigDecimal("200"))));

        assertThatThrownBy(() -> service.analyser(fichier, MOIS, CHANTIER_ID, forfaits))
                .isInstanceOf(HeuresSuppImportException.class).hasMessageContaining("Un seul forfait par CIN");
    }

    private static FichierHeuresSupp classeur(String heures) {
        return new FichierHeuresSupp(List.of(new LigneFichierHeuresSupp(2, "Alaoui Salma", CIN, new BigDecimal(heures))), 0, 1);
    }

    private void paiePresente() {
        when(paie.findPeriodes(null)).thenReturn(List.of(
                new PaiePeriodeResumeDto(MOIS.toString(), 1, 1, BigDecimal.ZERO, 0, BigDecimal.ZERO)));
        when(chantiers.existsById(CHANTIER_ID)).thenReturn(true);
    }

    private static EmployeeResponseDto employe() {
        return new EmployeeResponseDto(EMPLOYE_ID, 0L, "Alaoui Salma", CIN, LocalDate.of(1990, 1, 1),
                LocalDate.of(2020, 1, 1), new FunctionSummaryDto(17L, "Chauffeur"), null, null,
                new BigDecimal("4000"), TypeSalaire.MENSUEL, EmployeeStatut.ACTIF);
    }

    private static PaieResponseDto bulletin(String observation) {
        return new PaieResponseDto(90L, 0L, null, MOIS, null, null, null, BigDecimal.ZERO, null, null,
                BigDecimal.ZERO, null, null, BigDecimal.ZERO, observation);
    }
}

package staport.rh.paie.imports;

import jakarta.persistence.EntityManager;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.util.CellUtil;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.mock.web.MockMultipartFile;
import staport.rh.chantier.dtos.response.ChantierResponseDto;
import staport.rh.chantier.entities.Chantier;
import staport.rh.chantier.services.interfaces.IChantierService;
import staport.rh.employee.dtos.request.EmployeeCreateRequestDto;
import staport.rh.employee.dtos.request.EmployeeUpdateRequestDto;
import staport.rh.employee.dtos.response.ChantierSummaryDto;
import staport.rh.employee.dtos.response.EmployeeResponseDto;
import staport.rh.employee.dtos.response.EquipeSummaryDto;
import staport.rh.employee.dtos.response.FunctionSummaryDto;
import staport.rh.employee.entities.Employee;
import staport.rh.employee.entities.EmployeeStatut;
import staport.rh.employee.entities.TypeSalaire;
import staport.rh.employee.services.interfaces.IEmployeeService;
import staport.rh.equipe.dtos.response.EquipeResponseDto;
import staport.rh.equipe.entities.Equipe;
import staport.rh.equipe.services.interfaces.IEquipeService;
import staport.rh.function.dtos.request.FunctionCreateRequestDto;
import staport.rh.function.dtos.response.FunctionResponseDto;
import staport.rh.function.entities.Function;
import staport.rh.function.services.interfaces.IFunctionService;
import staport.rh.paie.entities.Paie;
import staport.rh.paie.imports.PaieImportAnalyseDto.ChampDto;
import staport.rh.paie.repositories.PaieRepository;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PaieImportServiceTest {

    private static final YearMonth AOUT = YearMonth.of(2026, 8);
    private static final YearMonth SEPTEMBRE = YearMonth.of(2026, 9);

    @Mock
    private PaieRepository repository;
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

    private PaieImportService importService;
    private final List<EmployeeResponseDto> employes = new ArrayList<>();

    @BeforeEach
    void preparer() {
        importService = new PaieImportService(repository, new LecteurFichierPaie(), employeeService, functionService,
                chantierService, equipeService, entityManager);
        employes.clear();
        employes.add(fiche(1L, "BOULJIHEL SALH", "PB85747", EmployeeStatut.ACTIF));
        lenient().when(repository.findDernierePeriode()).thenReturn(AOUT);
        lenient().when(repository.findEmployeeIdsByPeriode(any())).thenReturn(Set.of());
        lenient().when(employeeService.search(isNull(), any(Pageable.class))).thenAnswer(appel -> new PageImpl<>(List.copyOf(employes)));
        lenient().when(functionService.search(isNull(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(new FunctionResponseDto(10L, 0L, "OPERATEUR"))));
        lenient().when(chantierService.search(isNull(), any(Pageable.class))).thenReturn(new PageImpl<>(List.of(
                new ChantierResponseDto(20L, 0L, "C059", "Travaux de voirie", null, false, true),
                new ChantierResponseDto(21L, 0L, "C168", "Nador", null, false, true))));
        lenient().when(equipeService.search(isNull(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(new EquipeResponseDto(30L, 0L, "EQUIPE A", "Equipe A"))));
        lenient().when(entityManager.getReference(eq(Employee.class), any())).thenReturn(new Employee());
        lenient().when(entityManager.getReference(eq(Function.class), any())).thenReturn(new Function());
        lenient().when(entityManager.getReference(eq(Chantier.class), any())).thenReturn(new Chantier());
        lenient().when(entityManager.getReference(eq(Equipe.class), any())).thenReturn(new Equipe());
    }

    // ---- Mois ----

    @Test
    void refuse_un_autre_mois_que_celui_qui_suit_le_dernier_importe() throws IOException {
        assertThatThrownBy(() -> importService.analyser(fichier(ligne("PB85747")), YearMonth.of(2026, 10)))
                .isInstanceOf(PaieImportException.class)
                .hasMessageContaining("Seul le mois 2026-09");
        assertThatThrownBy(() -> importService.analyser(fichier(ligne("PB85747")), AOUT)).isInstanceOf(PaieImportException.class);
    }

    @Test
    void accepte_n_importe_quel_mois_quand_il_n_y_a_encore_aucune_paie() throws IOException {
        when(repository.findDernierePeriode()).thenReturn(null);

        assertThat(importService.analyser(fichier(ligne("PB85747")), YearMonth.of(2020, 3)).pret()).isTrue();
    }

    // ---- Analyse ----

    @Test
    void un_fichier_qui_concorde_avec_les_fiches_est_pret() throws IOException {
        PaieImportAnalyseDto analyse = importService.analyser(fichier(ligne("PB85747")), SEPTEMBRE);

        assertThat(analyse.pret()).isTrue();
        assertThat(analyse.totalLignes()).isEqualTo(1);
        assertThat(analyse.erreurs()).isEmpty();
        assertThat(analyse.ecarts()).isEmpty();
        assertThat(analyse.departs()).isEmpty();
        verify(repository, never()).save(any(Paie.class));
    }

    @Test
    void un_salaire_a_zero_est_une_erreur_du_fichier() throws IOException {
        Object[] ligne = ligne("PB85747");
        ligne[6] = 0.0;

        PaieImportAnalyseDto analyse = importService.analyser(fichier(ligne), SEPTEMBRE);

        assertThat(analyse.pret()).isFalse();
        assertThat(analyse.erreurs()).singleElement().satisfies(erreur -> assertThat(erreur.raison()).startsWith("Salaire à 0"));
    }

    @Test
    void signale_les_erreurs_que_seul_le_fichier_peut_corriger() throws IOException {
        Object[] chantierInconnu = ligne("PB85747");
        chantierInconnu[11] = "C999";
        Object[] equipeInconnue = ligne("CD456");
        equipeInconnue[12] = "EQUIPE Z";
        Object[] sansTotal = ligne("EF789");
        sansTotal[9] = "";
        Object[] negatif = ligne("GH012");
        negatif[7] = -5.0;

        PaieImportAnalyseDto analyse = importService.analyser(fichier(chantierInconnu, equipeInconnue, sansTotal, negatif, ligne("CD456")), SEPTEMBRE);

        assertThat(analyse.erreurs()).extracting(PaieImportAnalyseDto.ErreurDto::raison).containsExactly(
                "Chantier introuvable ou inactif : C999",
                "Équipe introuvable : EQUIPE Z",
                "Champs obligatoires manquants ou invalides : Total",
                "Les jours, salaires et primes doivent être positifs ou nuls");
        assertThat(analyse.cinInconnus()).as("le CD456 de la dernière ligne, valide").hasSize(1);
    }

    @Test
    void signale_un_cin_en_double_et_un_bulletin_deja_present() throws IOException {
        when(repository.findEmployeeIdsByPeriode(SEPTEMBRE)).thenReturn(Set.of(1L));

        PaieImportAnalyseDto analyse = importService.analyser(fichier(ligne("PB85747"), ligne("pb85747 ")), SEPTEMBRE);

        assertThat(analyse.erreurs()).extracting(PaieImportAnalyseDto.ErreurDto::raison).containsExactly(
                "Un bulletin existe déjà pour cet employé sur cette période (à modifier depuis l'écran Paie)",
                "Un bulletin existe déjà pour cet employé sur cette période (à modifier depuis l'écran Paie)");
    }

    @Test
    void un_cin_sans_fiche_est_a_creer_et_non_une_erreur() throws IOException {
        PaieImportAnalyseDto analyse = importService.analyser(fichier(ligne("PB85747"), ligne("XX00000")), SEPTEMBRE);

        assertThat(analyse.erreurs()).isEmpty();
        assertThat(analyse.cinInconnus()).singleElement().satisfies(inconnu -> {
            assertThat(inconnu.cin()).isEqualTo("XX00000");
            assertThat(inconnu.numeroLigne()).isEqualTo(5);
            assertThat(inconnu.salaire()).isEqualByComparingTo("5000");
        });
        assertThat(analyse.pret()).isFalse();
    }

    @Test
    void releve_chaque_champ_ou_la_fiche_et_le_fichier_different() throws IOException {
        Object[] ligne = {"BOULJIHEL  SALAH", "CHAUFFEUR", "PB85747", 26.0, 0.0, 0.0, 4500.0, 0.0, 0.0, 4500.0, "", "C168", ""};

        PaieImportAnalyseDto analyse = importService.analyser(fichier(ligne), SEPTEMBRE);

        assertThat(analyse.ecarts()).singleElement().satisfies(ecart -> {
            assertThat(ecart.employeId()).isEqualTo(1L);
            assertThat(ecart.typeSalaire()).isEqualTo(TypeSalaire.MENSUEL);
            assertThat(ecart.champs()).containsExactly(
                    new ChampDto("nomPrenom", "BOULJIHEL SALH", "BOULJIHEL  SALAH"),
                    new ChampDto("fonction", "OPERATEUR", "CHAUFFEUR"),
                    new ChampDto("chantier", "C059", "C168"),
                    new ChampDto("equipe", "EQUIPE A", null),
                    new ChampDto("salaire", "5000.00", "4500.0"));
        });
        assertThat(analyse.pret()).isFalse();
    }

    @Test
    void compare_le_nom_sans_tenir_compte_de_la_casse_ni_des_espaces() throws IOException {
        Object[] ligne = ligne("PB85747");
        ligne[0] = " bouljihel   salh ";

        assertThat(importService.analyser(fichier(ligne), SEPTEMBRE).ecarts()).isEmpty();
    }

    @Test
    void propose_les_departs_stc_et_absents_et_les_retours_des_inactifs_presents() throws IOException {
        employes.add(fiche(2L, "ABSENT ALI", "AB111", EmployeeStatut.ACTIF));
        employes.add(fiche(3L, "RETOUR ZAHRA", "RZ222", EmployeeStatut.INACTIF));
        employes.add(fiche(4L, "PARTI OMAR", "PO333", EmployeeStatut.INACTIF));
        Object[] stc = ligne("PB85747");
        stc[10] = " stc ";
        Object[] retour = ligne("RZ222");
        retour[0] = "RETOUR ZAHRA";

        PaieImportAnalyseDto analyse = importService.analyser(fichier(stc, retour), SEPTEMBRE);

        assertThat(analyse.departs()).extracting(PaieImportAnalyseDto.DepartDto::employeId, PaieImportAnalyseDto.DepartDto::motif)
                .containsExactly(org.assertj.core.groups.Tuple.tuple(1L, "STC"), org.assertj.core.groups.Tuple.tuple(2L, null));
        assertThat(analyse.retours()).extracting(PaieImportAnalyseDto.RetourDto::employeId).containsExactly(3L);
        assertThat(analyse.pret()).as("départs et retours ne bloquent pas l'import").isTrue();
    }

    // ---- Corrections ----

    @Test
    void aligner_reprend_les_valeurs_de_la_ligne_et_cree_la_fonction_inconnue() throws IOException {
        Object[] ligne = {"BOULJIHEL SALAH", "SOUDEUR", "PB85747", 26.0, 0.0, 0.0, 120.0, 0.0, 0.0, 3120.0, "", "C168", ""};
        when(functionService.create(new FunctionCreateRequestDto("SOUDEUR"))).thenReturn(new FunctionResponseDto(11L, 0L, "SOUDEUR"));

        importService.corriger(fichier(ligne), SEPTEMBRE,
                new PaieImportCorrectionsDto(List.of(new PaieImportCorrectionsDto.Alignement(1L, TypeSalaire.JOURNALIER)), null));

        ArgumentCaptor<EmployeeUpdateRequestDto> modification = ArgumentCaptor.forClass(EmployeeUpdateRequestDto.class);
        verify(employeeService).update(eq(1L), modification.capture());
        EmployeeUpdateRequestDto dto = modification.getValue();
        assertThat(dto.nomPrenom()).isEqualTo("BOULJIHEL SALAH");
        assertThat(dto.fonctionId()).isEqualTo(11L);
        assertThat(dto.chantierId()).isEqualTo(21L);
        assertThat(dto.equipeId()).isNull();
        assertThat(dto.salaire()).isEqualByComparingTo("120");
        assertThat(dto.typeSalaire()).isEqualTo(TypeSalaire.JOURNALIER);
        assertThat(dto.cin()).isEqualTo("PB85747");
        assertThat(dto.statut()).isEqualTo(EmployeeStatut.ACTIF);
    }

    @Test
    void aligner_demande_le_type_de_salaire_quand_la_fiche_n_en_a_pas() throws IOException {
        employes.set(0, new EmployeeResponseDto(1L, 0L, "BOULJIHEL SALH", "PB85747", LocalDate.of(1984, 5, 1), LocalDate.of(2018, 7, 14),
                new FunctionSummaryDto(10L, "OPERATEUR"), new ChantierSummaryDto(20L, "C059", ""), null, null, null, EmployeeStatut.ACTIF));

        assertThatThrownBy(() -> importService.corriger(fichier(ligne("PB85747")), SEPTEMBRE,
                new PaieImportCorrectionsDto(List.of(new PaieImportCorrectionsDto.Alignement(1L, null)), null)))
                .isInstanceOf(PaieImportException.class)
                .hasMessageContaining("type de salaire");
        verify(employeeService, never()).update(any(), any());
    }

    @Test
    void creer_un_cin_inconnu_avec_les_valeurs_du_fichier_et_les_dates_saisies() throws IOException {
        importService.corriger(fichier(ligne("PB85747"), ligne("XX00000")), SEPTEMBRE, new PaieImportCorrectionsDto(null,
                List.of(new PaieImportCorrectionsDto.Creation(5, LocalDate.of(1990, 1, 2), LocalDate.of(2026, 9, 1), TypeSalaire.MENSUEL))));

        ArgumentCaptor<EmployeeCreateRequestDto> creation = ArgumentCaptor.forClass(EmployeeCreateRequestDto.class);
        verify(employeeService).create(creation.capture());
        assertThat(creation.getValue()).isEqualTo(new EmployeeCreateRequestDto("BOULJIHEL SALH", "XX00000", LocalDate.of(1990, 1, 2),
                LocalDate.of(2026, 9, 1), 10L, 20L, 30L, new BigDecimal("5000.0"), TypeSalaire.MENSUEL));
    }

    @Test
    void creer_refuse_une_ligne_qui_n_est_pas_un_cin_inconnu() throws IOException {
        assertThatThrownBy(() -> importService.corriger(fichier(ligne("PB85747")), SEPTEMBRE, new PaieImportCorrectionsDto(null,
                List.of(new PaieImportCorrectionsDto.Creation(4, LocalDate.of(1990, 1, 2), LocalDate.of(2026, 9, 1), TypeSalaire.MENSUEL)))))
                .isInstanceOf(PaieImportException.class);
        verify(employeeService, never()).create(any());
    }

    // ---- Import ----

    @Test
    void importer_refuse_un_fichier_qui_n_est_pas_pret_sans_rien_enregistrer() throws IOException {
        assertThatThrownBy(() -> importService.importer(fichier(ligne("XX00000")), SEPTEMBRE, new PaieImportDepartsDto(null)))
                .isInstanceOf(PaieImportException.class)
                .hasMessageContaining("1 CIN inconnu");
        verify(repository, never()).save(any(Paie.class));
    }

    @Test
    void importer_cree_les_bulletins_repasse_actifs_les_retours_et_enregistre_les_departs_confirmes() throws IOException {
        employes.add(fiche(2L, "ABSENT ALI", "AB111", EmployeeStatut.ACTIF));
        employes.add(fiche(3L, "RETOUR ZAHRA", "RZ222", EmployeeStatut.INACTIF));
        Object[] retour = ligne("RZ222");
        retour[0] = "RETOUR ZAHRA";
        Object[] stc = ligne("PB85747");
        stc[10] = "STC";

        PaieImportResultDto bilan = importService.importer(fichier(stc, retour), SEPTEMBRE, new PaieImportDepartsDto(List.of(
                new PaieImportDepartsDto.Depart(1L, "STC"))));

        assertThat(bilan).isEqualTo(new PaieImportResultDto(SEPTEMBRE, 2, 1, 1));
        ArgumentCaptor<Paie> bulletin = ArgumentCaptor.forClass(Paie.class);
        verify(repository, org.mockito.Mockito.times(2)).save(bulletin.capture());
        assertThat(bulletin.getAllValues().get(0).getSalaireTotal()).as("le total est repris tel quel").isEqualByComparingTo("5300");
        assertThat(bulletin.getAllValues().get(0).getPeriode()).isEqualTo(SEPTEMBRE);
        ArgumentCaptor<EmployeeUpdateRequestDto> reactivation = ArgumentCaptor.forClass(EmployeeUpdateRequestDto.class);
        verify(employeeService).update(eq(3L), reactivation.capture());
        assertThat(reactivation.getValue().statut()).isEqualTo(EmployeeStatut.ACTIF);
        verify(employeeService).enregistrerSortie(1L, SEPTEMBRE, "STC");
        verify(employeeService, never()).enregistrerSortie(eq(2L), any(), any());
    }

    @Test
    void importer_refuse_un_depart_que_l_analyse_n_a_pas_propose() throws IOException {
        assertThatThrownBy(() -> importService.importer(fichier(ligne("PB85747")), SEPTEMBRE,
                new PaieImportDepartsDto(List.of(new PaieImportDepartsDto.Depart(1L, "Démission")))))
                .isInstanceOf(PaieImportException.class);
        verify(repository, never()).save(any(Paie.class));
    }

    // ---- Outils ----

    private static EmployeeResponseDto fiche(long id, String nom, String cin, EmployeeStatut statut) {
        return new EmployeeResponseDto(id, 0L, nom, cin, LocalDate.of(1984, 5, 1), LocalDate.of(2018, 7, 14),
                new FunctionSummaryDto(10L, "OPERATEUR"), new ChantierSummaryDto(20L, "C059", "Travaux de voirie"),
                new EquipeSummaryDto(30L, "EQUIPE A", "Equipe A"), new BigDecimal("5000.00"), TypeSalaire.MENSUEL, statut);
    }

    /** Une ligne qui concorde avec la fiche de BOULJIHEL SALH (sauf le CIN). */
    private static Object[] ligne(String cin) {
        return new Object[]{"BOULJIHEL SALH", "OPERATEUR", cin, 26.0, 0.0, 0.0, 5000.0, 200.0, 100.0, 5300.0, "", "C059", "EQUIPE A"};
    }

    private static MockMultipartFile fichier(Object[]... lignes) throws IOException {
        try (XSSFWorkbook classeur = new XSSFWorkbook()) {
            Sheet feuille = classeur.createSheet();
            feuille.createRow(0);
            feuille.createRow(1);
            feuille.createRow(2).createCell(0).setCellValue("Nom & prénom");
            for (int r = 0; r < lignes.length; r++) {
                Row ligne = feuille.createRow(r + 3);
                for (int c = 0; c < lignes[r].length; c++) {
                    Object valeur = lignes[r][c];
                    if (valeur instanceof Double nombre) {
                        CellUtil.getCell(ligne, c).setCellValue(nombre);
                    } else if (!"".equals(valeur)) {
                        CellUtil.getCell(ligne, c).setCellValue(String.valueOf(valeur));
                    }
                }
            }
            ByteArrayOutputStream sortie = new ByteArrayOutputStream();
            classeur.write(sortie);
            return new MockMultipartFile("file", "paie.xlsx",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sortie.toByteArray());
        }
    }
}

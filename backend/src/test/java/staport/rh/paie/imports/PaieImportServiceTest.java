package staport.rh.paie.imports;

import jakarta.persistence.EntityManager;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.util.CellUtil;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.mock.web.MockMultipartFile;
import staport.rh.chantier.dtos.response.ChantierResponseDto;
import staport.rh.chantier.entities.Chantier;
import staport.rh.chantier.services.interfaces.IChantierService;
import staport.rh.employee.dtos.response.EmployeeResponseDto;
import staport.rh.employee.entities.Employee;
import staport.rh.employee.services.interfaces.IEmployeeService;
import staport.rh.function.dtos.request.FunctionCreateRequestDto;
import staport.rh.function.dtos.response.FunctionResponseDto;
import staport.rh.function.entities.Function;
import staport.rh.function.services.interfaces.IFunctionService;
import staport.rh.paie.entities.Paie;
import staport.rh.paie.repositories.PaieRepository;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.YearMonth;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PaieImportServiceTest {

    @Mock
    private PaieRepository repository;

    @Mock
    private IEmployeeService employeeService;

    @Mock
    private IFunctionService functionService;

    @Mock
    private IChantierService chantierService;

    @Mock
    private EntityManager entityManager;

    @InjectMocks
    private PaieImportService importService;

    private final YearMonth periode = YearMonth.of(2026, 8);

    private void stubReferentiels() {
        Page<EmployeeResponseDto> employees = new PageImpl<>(List.of(
                new EmployeeResponseDto(1L, "BOULJIHEL SALH", "PB85747", null, null, null, null, null)));
        Page<FunctionResponseDto> functions = new PageImpl<>(List.of(
                new FunctionResponseDto(10L, "OPERATEUR")));
        Page<ChantierResponseDto> chantiers = new PageImpl<>(List.of(
                new ChantierResponseDto(20L, "C059", "Travaux de voirie", null, false, true)));
        lenient().when(employeeService.search(isNull(), any(Pageable.class))).thenReturn(employees);
        lenient().when(functionService.search(isNull(), any(Pageable.class))).thenReturn(functions);
        lenient().when(chantierService.search(isNull(), any(Pageable.class))).thenReturn(chantiers);
        lenient().when(entityManager.getReference(eq(Employee.class), any())).thenReturn(new Employee());
        lenient().when(entityManager.getReference(eq(Function.class), any())).thenReturn(new Function());
        lenient().when(entityManager.getReference(eq(Chantier.class), any())).thenReturn(new Chantier());
    }

    @Test
    void importer_devraitCreerUnBulletinQuandToutEstValideEtInexistant() throws IOException {
        stubReferentiels();
        when(repository.findByEmployee_IdAndPeriode(1L, periode)).thenReturn(Optional.empty());

        MockMultipartFile fichier = buildExcelFile(
                new Object[]{"", "", "", "", "", "", "", "", "", "", "", "", ""},
                new Object[]{"", "", "", "", "", "", "", "", "", "", "", "", ""},
                new Object[]{"Nom", "Fonction", "CIN", "P", "JRO", "JRD", "Salaire", "RO", "RD", "Total", "Obs", "Chantier", "Equipe"},
                new Object[]{"BOULJIHEL SALH", "OPERATEUR", "PB85747", 26.0, 0.0, 0.0, 5000.0, 200.0, 100.0, 5300.0, "", "C059", "EQUIPE A"}
        );

        PaieImportResultDto result = importService.importer(fichier, periode);

        assertThat(result.totalLignes()).isEqualTo(1);
        assertThat(result.crees()).isEqualTo(1);
        assertThat(result.misAJour()).isZero();
        assertThat(result.ignores()).isZero();
        verify(repository).save(any(Paie.class));
    }

    @Test
    void importer_devraitMettreAJourQuandLeBulletinExisteDeja() throws IOException {
        stubReferentiels();
        Paie existant = new Paie();
        existant.setId(5L);
        when(repository.findByEmployee_IdAndPeriode(1L, periode)).thenReturn(Optional.of(existant));

        MockMultipartFile fichier = buildExcelFile(
                new Object[]{"", "", "", "", "", "", "", "", "", "", "", "", ""},
                new Object[]{"", "", "", "", "", "", "", "", "", "", "", "", ""},
                new Object[]{"Nom", "Fonction", "CIN", "P", "JRO", "JRD", "Salaire", "RO", "RD", "Total", "Obs", "Chantier", "Equipe"},
                new Object[]{"BOULJIHEL SALH", "OPERATEUR", "PB85747", 26.0, 0.0, 0.0, 5000.0, 200.0, 100.0, 5300.0, "", "C059", "EQUIPE A"}
        );

        PaieImportResultDto result = importService.importer(fichier, periode);

        assertThat(result.crees()).isZero();
        assertThat(result.misAJour()).isEqualTo(1);
    }

    @Test
    void importer_devraitIgnorerUnCinInconnu() throws IOException {
        stubReferentiels();

        MockMultipartFile fichier = buildExcelFile(
                new Object[]{"", "", "", "", "", "", "", "", "", "", "", "", ""},
                new Object[]{"", "", "", "", "", "", "", "", "", "", "", "", ""},
                new Object[]{"Nom", "Fonction", "CIN", "P", "JRO", "JRD", "Salaire", "RO", "RD", "Total", "Obs", "Chantier", "Equipe"},
                new Object[]{"INCONNU", "OPERATEUR", "XX00000", 26.0, 0.0, 0.0, 5000.0, 200.0, 100.0, 5300.0, "", "C059", "EQUIPE A"}
        );

        PaieImportResultDto result = importService.importer(fichier, periode);

        assertThat(result.crees()).isZero();
        assertThat(result.ignores()).isEqualTo(1);
        assertThat(result.lignesIgnorees().get(0).raison()).isEqualTo("Employé introuvable avec ce CIN");
        verify(repository, never()).save(any(Paie.class));
    }

    @Test
    void importer_devraitIgnorerUnChantierIntrouvable() throws IOException {
        stubReferentiels();

        MockMultipartFile fichier = buildExcelFile(
                new Object[]{"", "", "", "", "", "", "", "", "", "", "", "", ""},
                new Object[]{"", "", "", "", "", "", "", "", "", "", "", "", ""},
                new Object[]{"Nom", "Fonction", "CIN", "P", "JRO", "JRD", "Salaire", "RO", "RD", "Total", "Obs", "Chantier", "Equipe"},
                new Object[]{"BOULJIHEL SALH", "OPERATEUR", "PB85747", 26.0, 0.0, 0.0, 5000.0, 200.0, 100.0, 5300.0, "", "C999", "EQUIPE A"}
        );

        PaieImportResultDto result = importService.importer(fichier, periode);

        assertThat(result.lignesIgnorees().get(0).raison()).contains("Chantier introuvable");
        verify(repository, never()).save(any(Paie.class));
    }

    @Test
    void importer_devraitCreerAutomatiquementUneFonctionInconnue() throws IOException {
        stubReferentiels();
        when(repository.findByEmployee_IdAndPeriode(1L, periode)).thenReturn(Optional.empty());
        when(functionService.create(new FunctionCreateRequestDto("GRUTIER")))
                .thenReturn(new FunctionResponseDto(99L, "GRUTIER"));

        MockMultipartFile fichier = buildExcelFile(
                new Object[]{"", "", "", "", "", "", "", "", "", "", "", "", ""},
                new Object[]{"", "", "", "", "", "", "", "", "", "", "", "", ""},
                new Object[]{"Nom", "Fonction", "CIN", "P", "JRO", "JRD", "Salaire", "RO", "RD", "Total", "Obs", "Chantier", "Equipe"},
                new Object[]{"BOULJIHEL SALH", "GRUTIER", "PB85747", 26.0, 0.0, 0.0, 5000.0, 200.0, 100.0, 5300.0, "", "C059", "EQUIPE A"}
        );

        PaieImportResultDto result = importService.importer(fichier, periode);

        assertThat(result.crees()).isEqualTo(1);
        assertThat(result.ignores()).isZero();
        assertThat(result.fonctionsCreees()).containsExactly("GRUTIER");
        verify(functionService).create(new FunctionCreateRequestDto("GRUTIER"));
    }

    @Test
    void importer_devraitReprendreLaColonneTotalTelleQuelle() throws IOException {
        stubReferentiels();
        when(repository.findByEmployee_IdAndPeriode(1L, periode)).thenReturn(Optional.empty());

        MockMultipartFile fichier = buildExcelFile(
                new Object[]{"", "", "", "", "", "", "", "", "", "", "", "", ""},
                new Object[]{"", "", "", "", "", "", "", "", "", "", "", "", ""},
                new Object[]{"Nom", "Fonction", "CIN", "P", "JRO", "JRD", "Salaire", "RO", "RD", "Total", "Obs", "Chantier", "Equipe"},
                // Main-d'œuvre : SALAIRE = tarif journalier (120), TOTAL = 120 x 31 jours = 3720, repris tel quel.
                new Object[]{"BAHTAT YOUSSEF", "OPERATEUR", "PB85747", 31.0, 0.0, 0.0, 120.0, 0.0, 0.0, 3720.0, "", "C059", "EQUIPE A"}
        );

        PaieImportResultDto result = importService.importer(fichier, periode);

        assertThat(result.crees()).isEqualTo(1);
        ArgumentCaptor<Paie> captor = ArgumentCaptor.forClass(Paie.class);
        verify(repository).save(captor.capture());
        assertThat(captor.getValue().getSalaireMensuel()).isEqualByComparingTo("120");
        assertThat(captor.getValue().getSalaireTotal()).isEqualByComparingTo("3720");
    }

    @Test
    void importer_devraitIgnorerUneLigneSansTotal() throws IOException {
        stubReferentiels();

        MockMultipartFile fichier = buildExcelFile(
                new Object[]{"", "", "", "", "", "", "", "", "", "", "", "", ""},
                new Object[]{"", "", "", "", "", "", "", "", "", "", "", "", ""},
                new Object[]{"Nom", "Fonction", "CIN", "P", "JRO", "JRD", "Salaire", "RO", "RD", "Total", "Obs", "Chantier", "Equipe"},
                new Object[]{"BOULJIHEL SALH", "OPERATEUR", "PB85747", 26.0, 0.0, 0.0, 5000.0, 200.0, 100.0, "", "", "C059", "EQUIPE A"}
        );

        PaieImportResultDto result = importService.importer(fichier, periode);

        assertThat(result.ignores()).isEqualTo(1);
        assertThat(result.lignesIgnorees().get(0).raison()).contains("Total");
        verify(repository, never()).save(any(Paie.class));
    }

    @Test
    void genererModele_devraitProduireUnFichierAvecLes13ColonnesEtTroisLignesDentete() throws IOException {
        ByteArrayInputStream flux = importService.genererModele();

        try (XSSFWorkbook workbook = new XSSFWorkbook(flux)) {
            Sheet sheet = workbook.getSheetAt(0);
            Row entete = sheet.getRow(2);
            assertThat(entete.getCell(0).getStringCellValue()).isEqualTo("Nom & prénom");
            assertThat(entete.getCell(1).getStringCellValue()).isEqualTo("Fonction");
            assertThat(entete.getCell(2).getStringCellValue()).isEqualTo("CIN");
            assertThat(entete.getCell(11).getStringCellValue()).isEqualTo("Chantier");
            assertThat(entete.getCell(12).getStringCellValue()).isEqualTo("Équipe");
        }
    }

    @Test
    void importer_devraitToutRejeterQuandUneSeuleLigneEstInvalideParmiPlusieurs() throws IOException {
        stubReferentiels();

        MockMultipartFile fichier = buildExcelFile(
                new Object[]{"", "", "", "", "", "", "", "", "", "", "", "", ""},
                new Object[]{"", "", "", "", "", "", "", "", "", "", "", "", ""},
                new Object[]{"Nom", "Fonction", "CIN", "P", "JRO", "JRD", "Salaire", "RO", "RD", "Total", "Obs", "Chantier", "Equipe"},
                new Object[]{"BOULJIHEL SALH", "OPERATEUR", "PB85747", 26.0, 0.0, 0.0, 5000.0, 200.0, 100.0, 5300.0, "", "C059", "EQUIPE A"},
                new Object[]{"INCONNU", "OPERATEUR", "XX00000", 26.0, 0.0, 0.0, 5000.0, 200.0, 100.0, 5300.0, "", "C059", "EQUIPE A"}
        );

        PaieImportResultDto result = importService.importer(fichier, periode);

        assertThat(result.totalLignes()).isEqualTo(2);
        assertThat(result.crees()).isZero();
        assertThat(result.misAJour()).isZero();
        assertThat(result.ignores()).isEqualTo(1);
        verify(repository, never()).save(any(Paie.class));
    }

    private MockMultipartFile buildExcelFile(Object[]... lignes) throws IOException {
        try (XSSFWorkbook workbook = new XSSFWorkbook()) {
            Sheet sheet = workbook.createSheet();
            for (int r = 0; r < lignes.length; r++) {
                Row row = sheet.createRow(r);
                Object[] valeurs = lignes[r];
                for (int c = 0; c < valeurs.length; c++) {
                    Object valeur = valeurs[c];
                    if (valeur instanceof Double d) {
                        CellUtil.getCell(row, c).setCellValue(d);
                    } else {
                        CellUtil.getCell(row, c).setCellValue(String.valueOf(valeur));
                    }
                }
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            workbook.write(out);
            return new MockMultipartFile("file", "paie.xlsx",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", out.toByteArray());
        }
    }
}

package staport.rh.employee.imports;

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
import staport.rh.employee.entities.Employee;
import staport.rh.employee.entities.EmployeeStatut;
import staport.rh.employee.repositories.EmployeeRepository;
import staport.rh.function.dtos.response.FunctionResponseDto;
import staport.rh.function.entities.Function;
import staport.rh.function.services.interfaces.IFunctionService;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;
import java.util.Set;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class EmployeeImportServiceTest {

    @Mock
    private EmployeeRepository repository;

    @Mock
    private IFunctionService functionService;

    @Mock
    private IChantierService chantierService;

    @Mock
    private EntityManager entityManager;

    @InjectMocks
    private EmployeeImportService importService;

    private void stubReferentiels() {
        Page<FunctionResponseDto> functions = new PageImpl<>(
                List.of(new FunctionResponseDto(10L, 0L, "OPERATEUR")));
        Page<ChantierResponseDto> chantiers = new PageImpl<>(
                List.of(new ChantierResponseDto(20L, 0L, "C059", "Travaux de voirie", null, false, true)));
        lenient().when(repository.findAllCinsEnMajuscules()).thenReturn(Set.of());
        lenient().when(functionService.search(isNull(), any(Pageable.class))).thenReturn(functions);
        lenient().when(chantierService.search(isNull(), any(Pageable.class))).thenReturn(chantiers);
        lenient().when(entityManager.getReference(eq(Function.class), any())).thenReturn(new Function());
        lenient().when(entityManager.getReference(eq(Chantier.class), any())).thenReturn(new Chantier());
    }

    @Test
    void importer_devraitCreerToutesLesLignesQuandLeFichierEstEntierementValide() throws IOException {
        stubReferentiels();

        MockMultipartFile file = buildExcelFile(
                new Object[]{"Date", "Nom", "CIN", "Fonction", "Chantier", "naissance"},
                new Object[]{toSerial(2018, 7, 14), "BOULJIHEL SALH", "PB85747", "OPERATEUR", "C059", toSerial(1984, 5, 1)}
        );

        EmployeeImportResultDto result = importService.importer(file);

        assertThat(result.totalLignes()).isEqualTo(1);
        assertThat(result.crees()).isEqualTo(1);
        assertThat(result.ignores()).isZero();

        ArgumentCaptor<Employee> captor = ArgumentCaptor.forClass(Employee.class);
        verify(repository).save(captor.capture());
        assertThat(captor.getValue().getStatut()).isEqualTo(EmployeeStatut.ACTIF);
    }

    @Test
    void importer_devraitRejeterLeFichierQuandLeCinExisteDejaEnBaseSansModifierLEmploye() throws IOException {
        stubReferentiels();
        // Le CIN existe en base, avec une casse différente de celle du fichier.
        when(repository.findAllCinsEnMajuscules()).thenReturn(Set.of("PB85747"));

        MockMultipartFile file = buildExcelFile(
                new Object[]{"Date", "Nom", "CIN", "Fonction", "Chantier", "naissance"},
                new Object[]{toSerial(2018, 7, 14), "NOUVEAU NOM", "pb85747", "OPERATEUR", "C059", toSerial(1984, 5, 1)}
        );

        EmployeeImportResultDto result = importService.importer(file);

        assertThat(result.crees()).isZero();
        assertThat(result.ignores()).isEqualTo(1);
        assertThat(result.lignesIgnorees().get(0).raison()).contains("Un employé existe déjà avec ce CIN");
        // L'import ne modifie jamais un employé existant : rien n'est sauvegardé.
        verify(repository, never()).save(any(Employee.class));
    }

    @Test
    void importer_devraitToutRejeterQuandUnCinEstEnDoublonDansLeFichier() throws IOException {
        stubReferentiels();

        MockMultipartFile file = buildExcelFile(
                new Object[]{"Date", "Nom", "CIN", "Fonction", "Chantier", "naissance"},
                new Object[]{toSerial(2018, 7, 14), "BOULJIHEL SALH", "PB85747", "OPERATEUR", "C059", toSerial(1984, 5, 1)},
                new Object[]{toSerial(2019, 1, 1), "AUTRE PERSONNE", "PB85747", "OPERATEUR", "C059", toSerial(1990, 1, 1)}
        );

        EmployeeImportResultDto result = importService.importer(file);

        assertThat(result.crees()).isZero();
        assertThat(result.ignores()).isEqualTo(1);
        assertThat(result.lignesIgnorees().get(0).raison()).isEqualTo("CIN en doublon dans le fichier");
        verify(repository, never()).save(any(Employee.class));
    }

    @Test
    void importer_devraitToutRejeterQuandUneLigneParmiPlusieursEstInvalide() throws IOException {
        stubReferentiels();

        MockMultipartFile file = buildExcelFile(
                new Object[]{"Date", "Nom", "CIN", "Fonction", "Chantier", "naissance"},
                new Object[]{toSerial(2018, 7, 14), "BOULJIHEL SALH", "PB85747", "OPERATEUR", "C059", toSerial(1984, 5, 1)},
                new Object[]{toSerial(2018, 7, 14), "SANS FONCTION", "PB99999", "", "C059", toSerial(1984, 5, 1)}
        );

        EmployeeImportResultDto result = importService.importer(file);

        assertThat(result.totalLignes()).isEqualTo(2);
        assertThat(result.crees()).isZero();
        assertThat(result.ignores()).isEqualTo(1);
        verify(repository, never()).save(any(Employee.class));
    }

    @Test
    void importer_devraitIgnorerUneFonctionIntrouvable() throws IOException {
        stubReferentiels();

        MockMultipartFile file = buildExcelFile(
                new Object[]{"Date", "Nom", "CIN", "Fonction", "Chantier", "naissance"},
                new Object[]{toSerial(2018, 7, 14), "BOULJIHEL SALH", "PB85747", "FONCTION INCONNUE", "C059", toSerial(1984, 5, 1)}
        );

        EmployeeImportResultDto result = importService.importer(file);

        assertThat(result.crees()).isZero();
        assertThat(result.lignesIgnorees().get(0).raison()).contains("Fonction introuvable");
    }

    @Test
    void importer_devraitIgnorerUnChampObligatoireManquant() throws IOException {
        stubReferentiels();

        MockMultipartFile file = buildExcelFile(
                new Object[]{"Date", "Nom", "CIN", "Fonction", "Chantier", "naissance"},
                new Object[]{toSerial(2018, 7, 14), "", "PB85747", "OPERATEUR", "C059", toSerial(1984, 5, 1)}
        );

        EmployeeImportResultDto result = importService.importer(file);

        assertThat(result.crees()).isZero();
        assertThat(result.lignesIgnorees().get(0).raison()).contains("Champs obligatoires manquants");
    }

    @Test
    void importer_devraitRejeterUnFormatInvalide() throws IOException {
        MockMultipartFile file = buildExcelFile(
                new Object[]{"Nom", "CIN"},
                new Object[]{"BOULJIHEL SALH", "PB85747"}
        );

        assertThatThrownBy(() -> importService.importer(file))
                .isInstanceOf(EmployeeImportException.class)
                .hasMessageContaining("Format de fichier invalide");
    }

    @Test
    void importer_devraitLeverUneExceptionQuandLeFichierEstIllisible() {
        MockMultipartFile fichierInvalide = new MockMultipartFile(
                "file", "invalide.xlsx", "application/octet-stream", "pas un excel".getBytes());

        assertThatThrownBy(() -> importService.importer(fichierInvalide))
                .isInstanceOf(EmployeeImportException.class);
    }

    @Test
    void genererModele_devraitProduireUnFichierAvecLes6ColonnesAttendues() throws IOException {
        java.io.ByteArrayInputStream flux = importService.genererModele();

        try (XSSFWorkbook workbook = new XSSFWorkbook(flux)) {
            Sheet sheet = workbook.getSheetAt(0);
            Row entete = sheet.getRow(0);
            assertThat(entete.getCell(0).getStringCellValue()).isEqualTo("Date d'embauche");
            assertThat(entete.getCell(1).getStringCellValue()).isEqualTo("Nom & prénom");
            assertThat(entete.getCell(2).getStringCellValue()).isEqualTo("CIN");
            assertThat(entete.getCell(3).getStringCellValue()).isEqualTo("Fonction");
            assertThat(entete.getCell(4).getStringCellValue()).isEqualTo("Chantier");
            assertThat(entete.getCell(5).getStringCellValue()).isEqualTo("Date de naissance");
            assertThat(sheet.getPhysicalNumberOfRows()).isEqualTo(1);
        }
    }

    private double toSerial(int year, int month, int day) {
        return org.apache.poi.ss.usermodel.DateUtil.getExcelDate(java.time.LocalDateTime.of(year, month, day, 0, 0));
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
            return new MockMultipartFile("file", "employes.xlsx",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", out.toByteArray());
        }
    }
}

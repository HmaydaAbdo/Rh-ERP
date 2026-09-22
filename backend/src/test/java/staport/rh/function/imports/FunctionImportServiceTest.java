package staport.rh.function.imports;

import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import staport.rh.function.entities.Function;
import staport.rh.function.repositories.FunctionRepository;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FunctionImportServiceTest {

    @Mock
    private FunctionRepository repository;

    @InjectMocks
    private FunctionImportService importService;

    @Test
    void importer_devraitCreerToutesLesFonctionsQuandLeFichierEstEntierementValide() throws IOException {
        MockMultipartFile file = buildExcelFile("Fonction", "OPERATEUR", "COMPTABLE CHANTIER");
        when(repository.existsByLibelleIgnoreCase(anyString())).thenReturn(false);

        FunctionImportResultDto result = importService.importer(file);

        assertThat(result.totalLignes()).isEqualTo(2);
        assertThat(result.crees()).isEqualTo(2);
        assertThat(result.ignores()).isZero();

        ArgumentCaptor<List<Function>> captor = ArgumentCaptor.forClass(List.class);
        org.mockito.Mockito.verify(repository).saveAll(captor.capture());
        assertThat(captor.getValue())
                .extracting(Function::getLibelle)
                .containsExactly("OPERATEUR", "COMPTABLE CHANTIER");
    }

    @Test
    void importer_devraitToutRejeterQuandUneSeuleLigneEstInvalide() throws IOException {
        MockMultipartFile file = buildExcelFile(
                "Fonction",
                "OPERATEUR",
                "",
                "COMPTABLE CHANTIER",
                "OPERATEUR",
                "a".repeat(150)
        );
        when(repository.existsByLibelleIgnoreCase(anyString())).thenReturn(false);

        FunctionImportResultDto result = importService.importer(file);

        assertThat(result.totalLignes()).isEqualTo(4);
        assertThat(result.crees()).isZero();
        assertThat(result.ignores()).isEqualTo(2);
        assertThat(result.lignesIgnorees())
                .extracting(FunctionImportResultDto.LigneIgnoreeDto::raison)
                .contains("Fonction déjà existante", "Libellé trop long (max 100 caractères)");

        org.mockito.Mockito.verify(repository, org.mockito.Mockito.never()).saveAll(org.mockito.ArgumentMatchers.anyList());
    }

    @Test
    void importer_devraitToutRejeterQuandUneFonctionExisteDejaEnBase() throws IOException {
        MockMultipartFile file = buildExcelFile("Fonction", "MACON");
        when(repository.existsByLibelleIgnoreCase("MACON")).thenReturn(true);

        FunctionImportResultDto result = importService.importer(file);

        assertThat(result.crees()).isZero();
        assertThat(result.ignores()).isEqualTo(1);
        assertThat(result.lignesIgnorees().get(0).raison()).isEqualTo("Fonction déjà existante");
        org.mockito.Mockito.verify(repository, org.mockito.Mockito.never()).saveAll(org.mockito.ArgumentMatchers.anyList());
    }

    @Test
    void importer_devraitLeverUneExceptionQuandLeFichierEstIllisible() {
        MockMultipartFile fichierInvalide = new MockMultipartFile(
                "file", "invalide.xlsx", "application/octet-stream", "pas un excel".getBytes());

        assertThatThrownBy(() -> importService.importer(fichierInvalide))
                .isInstanceOf(FunctionImportException.class);
    }

    @Test
    void genererModele_devraitProduireUnFichierAvecUniquementLEnTete() throws IOException {
        java.io.ByteArrayInputStream flux = importService.genererModele();

        try (XSSFWorkbook workbook = new XSSFWorkbook(flux)) {
            Sheet sheet = workbook.getSheetAt(0);
            assertThat(sheet.getRow(0).getCell(0).getStringCellValue()).isEqualTo("Fonction");
            assertThat(sheet.getPhysicalNumberOfRows()).isEqualTo(1);
        }
    }

    private MockMultipartFile buildExcelFile(String... lignes) throws IOException {
        try (XSSFWorkbook workbook = new XSSFWorkbook()) {
            Sheet sheet = workbook.createSheet();
            for (int i = 0; i < lignes.length; i++) {
                Row row = sheet.createRow(i);
                row.createCell(0).setCellValue(lignes[i]);
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            workbook.write(out);
            return new MockMultipartFile("file", "fonctions.xlsx",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", out.toByteArray());
        }
    }
}

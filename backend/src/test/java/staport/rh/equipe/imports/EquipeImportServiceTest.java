package staport.rh.equipe.imports;

import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import staport.rh.equipe.entities.Equipe;
import staport.rh.equipe.repositories.EquipeRepository;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class EquipeImportServiceTest {
    @Mock private EquipeRepository repository;
    @InjectMocks private EquipeImportService service;

    @Test
    void creeLesEquipesNormaliseesApresValidationComplete() throws IOException {
        when(repository.findAllCodesAndLibelles()).thenReturn(List.<Object[]>of(new Object[]{"CH", "Chauffeurs"}));
        var result = service.importer(fichier("Code", "Libellé", " op ", " Opérateurs ", "L1", "Laboratoire"));

        assertThat(result.totalLignes()).isEqualTo(2);
        assertThat(result.crees()).isEqualTo(2);
        assertThat(result.ignores()).isZero();
        ArgumentCaptor<List<Equipe>> captor = ArgumentCaptor.forClass(List.class);
        verify(repository).saveAll(captor.capture());
        assertThat(captor.getValue()).extracting(Equipe::getCode).containsExactly("OP", "L1");
        assertThat(captor.getValue()).extracting(Equipe::getLibelle).containsExactly("Opérateurs", "Laboratoire");
    }

    @Test
    void rejetteToutLeFichierEtDonneUneRaisonParLigneInvalide() throws IOException {
        when(repository.findAllCodesAndLibelles()).thenReturn(List.<Object[]>of(new Object[]{"CH", "Chauffeurs"}));
        var result = service.importer(fichier("Code", "Libellé", "op", "Opérateurs", "ch", "Autre", "x", "Chauffeurs", "x", "Autre libellé", "y", "Autre libellé", " op ", "Encore autre", "", "Sans code"));

        assertThat(result.totalLignes()).isEqualTo(7);
        assertThat(result.crees()).isZero();
        assertThat(result.ignores()).isEqualTo(5);
        assertThat(result.lignesIgnorees()).extracting(EquipeImportResultDto.LigneIgnoreeDto::raison)
                .containsExactly("Code d'équipe déjà existant", "Libellé d'équipe déjà existant", "Libellé déjà présent dans le fichier",
                        "Code déjà présent dans le fichier", "Code obligatoire");
        verify(repository, org.mockito.Mockito.never()).saveAll(org.mockito.ArgumentMatchers.anyList());
    }

    @Test
    void ignoreLesLignesEntierementVides() throws IOException {
        var result = service.importer(fichier("Code", "Libellé", "", "", "OP", "Opérateurs"));
        assertThat(result.totalLignes()).isEqualTo(1);
        assertThat(result.crees()).isEqualTo(1);
    }

    @Test
    void rejetteUnEnteteIncompatibleAvantTouteEcriture() throws IOException {
        assertThatThrownBy(() -> service.importer(fichier("Code", "Nom", "OP", "Opérateurs")))
                .isInstanceOf(EquipeImportException.class)
                .hasMessageContaining("Code").hasMessageContaining("Libellé");
        verify(repository, org.mockito.Mockito.never()).saveAll(org.mockito.ArgumentMatchers.anyList());
    }

    @Test
    void rejetteLesValeursAuDelaDesLongueursMaximales() throws IOException {
        var result = service.importer(fichier("Code", "Libellé", "C".repeat(51), "Equipe valide", "OP", "L".repeat(101)));
        assertThat(result.crees()).isZero();
        assertThat(result.lignesIgnorees()).extracting(EquipeImportResultDto.LigneIgnoreeDto::raison)
                .containsExactly("Code trop long (max 50 caractères)", "Libellé trop long (max 100 caractères)");
    }

    @Test
    void genereUnModeleViergeAvecLesDeuxEnTetesAttendus() throws IOException {
        try (Workbook workbook = new XSSFWorkbook(service.genererModele())) {
            assertThat(workbook.getSheetAt(0).getRow(0).getCell(0).getStringCellValue()).isEqualTo("Code");
            assertThat(workbook.getSheetAt(0).getRow(0).getCell(1).getStringCellValue()).isEqualTo("Libellé");
            assertThat(workbook.getSheetAt(0).getLastRowNum()).isZero();
        }
    }

    private static MockMultipartFile fichier(String code, String libelle, String... valeurs) throws IOException {
        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            var sheet = workbook.createSheet("Équipes");
            var header = sheet.createRow(0);
            header.createCell(0).setCellValue(code);
            header.createCell(1).setCellValue(libelle);
            for (int index = 0; index < valeurs.length; index += 2) {
                var row = sheet.createRow(index / 2 + 1);
                row.createCell(0).setCellValue(valeurs[index]);
                row.createCell(1).setCellValue(valeurs[index + 1]);
            }
            workbook.write(output);
            return new MockMultipartFile("file", "equipes.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", output.toByteArray());
        }
    }
}

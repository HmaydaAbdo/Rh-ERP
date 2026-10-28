package staport.rh.heuresupp.imports;

import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class LecteurFichierHeuresSuppTest {

    private final LecteurFichierHeuresSupp lecteur = new LecteurFichierHeuresSupp();

    @Test
    void lit_le_format_reel_conserve_et_compte_les_lignes_zero() throws Exception {
        FichierHeuresSupp fichier = lecteur.lire(classeur(new String[][]{
                {"Nom", "Prenom", "CIN", "Funct", "HS"},
                {"Alaoui", "Salma", "AB123", "Chauffeur", "0"},
                {"Bennani", "Nora", "CD456", "Conductrice", "1,5"}
        }));

        assertThat(fichier.totalLignes()).isEqualTo(2);
        assertThat(fichier.lignesZero()).isEqualTo(1);
        assertThat(fichier.lignes()).hasSize(2).satisfiesExactly(
                zero -> {
                    assertThat(zero.numeroLigne()).isEqualTo(2);
                    assertThat(zero.cin()).isEqualTo("AB123");
                    assertThat(zero.heures()).isEqualByComparingTo("0");
                },
                positive -> {
                    assertThat(positive.numeroLigne()).isEqualTo(3);
                    assertThat(positive.cin()).isEqualTo("CD456");
                    assertThat(positive.heures()).isEqualByComparingTo("1.5");
                });
    }

    @Test
    void accepte_les_entetes_fonction_et_ph_avec_accents() throws Exception {
        FichierHeuresSupp fichier = lecteur.lire(classeur(new String[][]{
                {"Nom", "Prenom", "CIN", "Fonction", "P/H"},
                {"Alaoui", "Salma", "AB123", "Chauffeur", "2"}
        }));
        assertThat(fichier.lignes()).hasSize(1);
    }

    @Test
    void signale_une_cellule_hs_vide_avec_son_numero_de_ligne() throws Exception {
        assertThatThrownBy(() -> lecteur.lire(classeur(new String[][]{
                {"Nom", "Prenom", "CIN", "Funct", "HS"},
                {"Alaoui", "Salma", "AB123", "Chauffeur", ""}
        }))).isInstanceOf(HeuresSuppImportException.class).hasMessageContaining("Ligne 2").hasMessageContaining("HS manquant");
    }

    @Test
    void refuse_un_cin_duplique_sans_casse() throws Exception {
        assertThatThrownBy(() -> lecteur.lire(classeur(new String[][]{
                {"Nom", "Prenom", "CIN", "Funct", "HS"},
                {"Alaoui", "Salma", "ab123", "Chauffeur", "1"},
                {"Alaoui", "Salma", "AB123", "Chauffeur", "2"}
        }))).isInstanceOf(HeuresSuppImportException.class).hasMessageContaining("Ligne 3").hasMessageContaining("CIN dupliqué");
    }

    @Test
    void refuse_les_heures_negatives_et_plus_d_une_decimale() throws Exception {
        for (String heures : new String[]{"-1", "1.25"}) {
            assertThatThrownBy(() -> lecteur.lire(classeur(new String[][]{
                    {"Nom", "Prenom", "CIN", "Funct", "HS"},
                    {"Alaoui", "Salma", "AB123", "Chauffeur", heures}
                }))).isInstanceOf(HeuresSuppImportException.class).hasMessageContaining("Ligne 2");
        }
    }

    @Test
    void refuse_entetes_absents_extensions_non_xlsx_et_classeur_vide() throws Exception {
        assertThatThrownBy(() -> lecteur.lire(classeur(new String[][]{{"Nom", "CIN"}, {"Alaoui", "AB123"}})))
                .isInstanceOf(HeuresSuppImportException.class).hasMessageContaining("En-têtes introuvables");
        assertThatThrownBy(() -> lecteur.lire(new MockMultipartFile("file", "import.csv", "text/csv", new byte[]{1})))
                .isInstanceOf(HeuresSuppImportException.class).hasMessageContaining(".xlsx");
        assertThatThrownBy(() -> lecteur.lire(null)).isInstanceOf(HeuresSuppImportException.class);
    }

    @Test
    void genere_un_modele_avec_les_cinq_entetes_attendus() throws Exception {
        try (XSSFWorkbook workbook = new XSSFWorkbook(lecteur.genererModele())) {
            Row header = workbook.getSheetAt(0).getRow(0);
            assertThat(header.getCell(0).getStringCellValue()).isEqualTo("Nom");
            assertThat(header.getCell(1).getStringCellValue()).isEqualTo("Prenom");
            assertThat(header.getCell(2).getStringCellValue()).isEqualTo("CIN");
            assertThat(header.getCell(3).getStringCellValue()).isEqualTo("Funct");
            assertThat(header.getCell(4).getStringCellValue()).isEqualTo("HS");
        }
    }

    private static MockMultipartFile classeur(String[][] lignes) throws Exception {
        try (XSSFWorkbook workbook = new XSSFWorkbook(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            var sheet = workbook.createSheet("Pointage");
            for (int r = 0; r < lignes.length; r++) {
                Row row = sheet.createRow(r);
                for (int c = 0; c < lignes[r].length; c++) {
                    String valeur = lignes[r][c];
                    if (valeur.isEmpty()) continue;
                    if (r > 0 && c == 4) {
                        row.createCell(c).setCellValue(new BigDecimal(valeur.replace(',', '.')).doubleValue());
                    } else {
                        row.createCell(c).setCellValue(valeur);
                    }
                }
            }
            workbook.write(output);
            return new MockMultipartFile("file", "heures.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", output.toByteArray());
        }
    }
}

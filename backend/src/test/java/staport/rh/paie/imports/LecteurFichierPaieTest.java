package staport.rh.paie.imports;

import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.IOException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class LecteurFichierPaieTest {

    private final LecteurFichierPaie lecteur = new LecteurFichierPaie();

    @Test
    void le_modele_a_trois_lignes_d_entete_et_les_13_colonnes_dans_l_ordre() throws IOException {
        try (XSSFWorkbook classeur = new XSSFWorkbook(lecteur.genererModele())) {
            Row entete = classeur.getSheetAt(0).getRow(2);
            assertThat(entete.getLastCellNum()).isEqualTo((short) 13);
            assertThat(entete.getCell(0).getStringCellValue()).isEqualTo("Nom & prénom");
            assertThat(entete.getCell(2).getStringCellValue()).isEqualTo("CIN");
            assertThat(entete.getCell(11).getStringCellValue()).isEqualTo("Chantier");
            assertThat(entete.getCell(12).getStringCellValue()).isEqualTo("Équipe");
        }
    }

    @Test
    void lit_les_lignes_apres_l_entete_garde_les_decimales_et_ignore_les_lignes_vides() throws IOException {
        MockMultipartFile fichier;
        try (XSSFWorkbook classeur = new XSSFWorkbook()) {
            Sheet feuille = classeur.createSheet();
            for (int r = 0; r < 3; r++) {
                feuille.createRow(r).createCell(0).setCellValue("en-tête");
            }
            Row ligne = feuille.createRow(3);
            ligne.createCell(0).setCellValue("ALI");
            ligne.createCell(2).setCellValue("AB1");
            ligne.createCell(3).setCellValue(25.5);
            ligne.createCell(6).setCellValue("4 000");
            feuille.createRow(4);
            ByteArrayOutputStream sortie = new ByteArrayOutputStream();
            classeur.write(sortie);
            fichier = new MockMultipartFile("file", "paie.xlsx", null, sortie.toByteArray());
        }

        assertThat(lecteur.lire(fichier)).singleElement().satisfies(ligne -> {
            assertThat(ligne.numeroLigne()).isEqualTo(4);
            assertThat(ligne.cin()).isEqualTo("AB1");
            assertThat(ligne.nombreJoursTravailles()).isEqualByComparingTo("25.5");
            assertThat(ligne.salaireMensuel()).as("espaces de milliers retirés").isEqualByComparingTo("4000");
            assertThat(ligne.fonction()).isNull();
        });
    }

    @Test
    void un_fichier_illisible_est_refuse() {
        assertThatThrownBy(() -> lecteur.lire(new MockMultipartFile("file", "paie.xlsx", null, new byte[]{1, 2, 3})))
                .isInstanceOf(PaieImportException.class)
                .hasMessageStartingWith("Fichier Excel illisible");
    }
}

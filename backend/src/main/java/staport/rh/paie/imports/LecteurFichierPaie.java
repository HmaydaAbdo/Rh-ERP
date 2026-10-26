package staport.rh.paie.imports;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/**
 * Lecture du fichier Excel de paie (format hérité de paie_old) : trois lignes d'en-tête, puis une ligne par employé, colonnes
 * Nom &amp; prénom, Fonction, CIN, Nbre jours travaillés, J.R.O, J.R.D, Salaire, Prime roulage ordinaire, Prime roulage dimanche,
 * Total [repris tel quel, jamais recalculé], Observation, Chantier, Équipe. Le mois n'est pas une colonne : il s'applique à
 * tout le fichier. Les lignes vides sont ignorées ; aucune règle métier n'est appliquée ici (voir {@link PaieImportService}).
 */
@Component
public class LecteurFichierPaie {

    private static final int LIGNES_ENTETE = 3;
    private static final DataFormatter DATA_FORMATTER = new DataFormatter();
    private static final String[] ENTETES = {
            "Nom & prénom", "Fonction", "CIN", "Nbre Jrs", "J.R.O", "J.R.D", "Salaire",
            "Prime RO", "Prime RD", "Total", "Observation", "Chantier", "Équipe"
    };

    /** Les lignes du fichier ; un fichier illisible lève {@link PaieImportException}. */
    public List<LigneFichierPaie> lire(MultipartFile fichier) {
        try (InputStream flux = fichier.getInputStream(); Workbook classeur = new XSSFWorkbook(flux)) {
            Sheet feuille = classeur.getSheetAt(0);
            List<LigneFichierPaie> lignes = new ArrayList<>();
            for (Row ligne : feuille) {
                int numeroLigne = ligne.getRowNum() + 1;
                if (numeroLigne <= LIGNES_ENTETE || estVide(ligne)) {
                    continue;
                }
                lignes.add(new LigneFichierPaie(numeroLigne,
                        texte(ligne.getCell(0)), texte(ligne.getCell(1)), texte(ligne.getCell(2)),
                        nombre(ligne.getCell(3)), nombre(ligne.getCell(4)), nombre(ligne.getCell(5)),
                        nombre(ligne.getCell(6)), nombre(ligne.getCell(7)), nombre(ligne.getCell(8)),
                        nombre(ligne.getCell(9)), texte(ligne.getCell(10)), texte(ligne.getCell(11)), texte(ligne.getCell(12))));
            }
            return lignes;
        } catch (IOException | RuntimeException e) {
            throw new PaieImportException("Fichier Excel illisible : " + e.getMessage());
        }
    }

    /**
     * Fichier Excel vierge au format attendu par {@link #lire} — trois lignes d'en-tête, colonnes dans l'ordre — pour que
     * l'utilisateur parte d'un fichier valide plutôt que de deviner le format.
     */
    public ByteArrayInputStream genererModele() {
        try (Workbook classeur = new XSSFWorkbook(); ByteArrayOutputStream sortie = new ByteArrayOutputStream()) {
            Sheet feuille = classeur.createSheet("Paie");
            feuille.createRow(0);
            feuille.createRow(1);
            Row entete = feuille.createRow(2);
            for (int c = 0; c < ENTETES.length; c++) {
                entete.createCell(c).setCellValue(ENTETES[c]);
                feuille.setColumnWidth(c, 4500);
            }
            classeur.write(sortie);
            return new ByteArrayInputStream(sortie.toByteArray());
        } catch (IOException e) {
            throw new UncheckedIOException("Erreur lors de la génération du modèle d'import : " + e.getMessage(), e);
        }
    }

    private static boolean estVide(Row ligne) {
        if (ligne == null) {
            return true;
        }
        for (int c = ligne.getFirstCellNum(); c < ligne.getLastCellNum(); c++) {
            Cell cellule = ligne.getCell(c);
            if (cellule != null && cellule.getCellType() != CellType.BLANK
                    && !DATA_FORMATTER.formatCellValue(cellule).isBlank()) {
                return false;
            }
        }
        return true;
    }

    private static String texte(Cell cellule) {
        if (cellule == null) {
            return null;
        }
        String valeur = DATA_FORMATTER.formatCellValue(cellule);
        return valeur == null || valeur.isBlank() ? null : valeur;
    }

    private static BigDecimal nombre(Cell cellule) {
        if (cellule == null) {
            return null;
        }
        try {
            // Cellule de formule (ex. =G5*D5) : on lit le résultat mis en cache par Excel, pas le texte formaté.
            CellType type = cellule.getCellType() == CellType.FORMULA ? cellule.getCachedFormulaResultType() : cellule.getCellType();
            if (type == CellType.NUMERIC) {
                return BigDecimal.valueOf(cellule.getNumericCellValue());
            }
            String valeur = DATA_FORMATTER.formatCellValue(cellule).replaceAll("[\\s\\u00A0\\u202F]", "");
            return valeur.isEmpty() ? null : new BigDecimal(valeur);
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("Valeur numérique invalide dans la cellule " + cellule.getAddress(), e);
        }
    }
}

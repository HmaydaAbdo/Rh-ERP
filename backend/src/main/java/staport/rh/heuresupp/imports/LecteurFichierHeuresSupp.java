package staport.rh.heuresupp.imports;

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
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Lecture du classeur Heures supplémentaires ; aucune résolution de personne ni règle métier n'est appliquée ici. */
@Component
public class LecteurFichierHeuresSupp {

    private static final int TAILLE_MAX = 20 * 1024 * 1024;
    private static final DataFormatter FORMATTEUR = new DataFormatter(Locale.FRANCE);
    private static final String TYPE_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    public FichierHeuresSupp lire(MultipartFile fichier) {
        if (fichier == null || fichier.isEmpty()) {
            throw new HeuresSuppImportException("Sélectionnez un fichier Excel contenant les CIN et les heures supplémentaires.");
        }
        if (fichier.getSize() > TAILLE_MAX) {
            throw new HeuresSuppImportException("Le fichier dépasse la taille maximale de 20 Mo.");
        }
        if (fichier.getOriginalFilename() == null || !fichier.getOriginalFilename().toLowerCase(Locale.ROOT).endsWith(".xlsx")) {
            throw new HeuresSuppImportException("Le fichier doit être au format Excel .xlsx.");
        }
        try (InputStream flux = fichier.getInputStream(); Workbook classeur = new XSSFWorkbook(flux)) {
            if (classeur.getNumberOfSheets() == 0) {
                throw new HeuresSuppImportException("Le classeur ne contient aucune feuille.");
            }
            return lireFeuille(classeur.getSheetAt(0));
        } catch (IOException | IllegalArgumentException e) {
            if (e instanceof HeuresSuppImportException importException) {
                throw importException;
            }
            throw new HeuresSuppImportException("Fichier Excel illisible : " + e.getMessage());
        }
    }

    public ByteArrayInputStream genererModele() {
        try (Workbook classeur = new XSSFWorkbook(); ByteArrayOutputStream sortie = new ByteArrayOutputStream()) {
            Sheet feuille = classeur.createSheet("Heures supplémentaires");
            Row entete = feuille.createRow(0);
            entete.createCell(0).setCellValue("Nom et prénom");
            entete.createCell(1).setCellValue("CIN");
            entete.createCell(2).setCellValue("HS");
            feuille.setColumnWidth(0, 8000);
            feuille.setColumnWidth(1, 3600);
            feuille.setColumnWidth(2, 2600);
            classeur.write(sortie);
            return new ByteArrayInputStream(sortie.toByteArray());
        } catch (IOException e) {
            throw new UncheckedIOException("Erreur lors de la génération du modèle Heures supplémentaires.", e);
        }
    }

    private FichierHeuresSupp lireFeuille(Sheet feuille) {
        int ligneEntete = -1;
        int colonneNom = -1;
        int colonneCin = -1;
        int colonneHeures = -1;
        for (int index = 0; index <= Math.min(feuille.getLastRowNum(), 9); index++) {
            Row ligne = feuille.getRow(index);
            if (ligne == null) {
                continue;
            }
            int colonnesNonVides = 0;
            for (int colonne = Math.max(0, ligne.getFirstCellNum()); colonne < ligne.getLastCellNum(); colonne++) {
                String valeur = normaliser(texte(ligne.getCell(colonne)));
                if (!valeur.isBlank()) colonnesNonVides++;
                if (valeur.matches("nom et prenom|nom prenom|nomprenom")) colonneNom = colonne;
                if (valeur.equals("cin")) {
                    colonneCin = colonne;
                }
                if (valeur.matches("hs|p ?/ ?h|p h|heures? supplementaires?|nbre heures? supp")) {
                    colonneHeures = colonne;
                }
            }
            if (colonneNom >= 0 && colonneCin >= 0 && colonneHeures >= 0) {
                if (colonnesNonVides != 3) {
                    throw new HeuresSuppImportException("Le fichier doit contenir uniquement les trois colonnes Nom et prénom, CIN et HS.");
                }
                ligneEntete = index;
                break;
            }
        }
        if (ligneEntete < 0) {
            throw new HeuresSuppImportException("En-têtes introuvables : le fichier doit contenir Nom et prénom, CIN et HS.");
        }

        List<LigneFichierHeuresSupp> lignes = new ArrayList<>();
        Set<String> cins = new HashSet<>();
        int totalLignes = 0;
        int lignesZero = 0;
        for (int index = ligneEntete + 1; index <= feuille.getLastRowNum(); index++) {
            Row ligne = feuille.getRow(index);
            if (estVide(ligne)) {
                continue;
            }
            totalLignes++;
            BigDecimal heures;
            try {
                heures = nombre(ligne.getCell(colonneHeures));
            } catch (IllegalArgumentException e) {
                throw new HeuresSuppImportException("Ligne " + (index + 1) + " : " + e.getMessage());
            }
            if (heures != null && heures.signum() == 0) {
                lignesZero++;
            }
            String nomPrenom = texte(ligne.getCell(colonneNom));
            String cin = texte(ligne.getCell(colonneCin));
            if (nomPrenom.isBlank() || cin.isBlank()) {
                throw new HeuresSuppImportException("Ligne " + (index + 1) + " : Nom et prénom, CIN et HS sont requis.");
            }
            if (heures == null) {
                throw new HeuresSuppImportException("Ligne " + (index + 1) + " : HS manquant.");
            }
            if (cin.isBlank()) {
                throw new HeuresSuppImportException("Ligne " + (index + 1) + " : CIN manquant.");
            }
            cin = cin.strip();
            if (!cins.add(cin.toUpperCase(Locale.ROOT))) {
                throw new HeuresSuppImportException("Ligne " + (index + 1) + " : CIN dupliqué dans le fichier (" + cin + "). Corrigez ou regroupez les heures sur une seule ligne.");
            }
            if (heures.signum() < 0 || heures.scale() > 1 || heures.precision() - heures.scale() > 7) {
                throw new HeuresSuppImportException("Ligne " + (index + 1) + " : HS doit être positif ou nul et comporter au plus une décimale.");
            }
            lignes.add(new LigneFichierHeuresSupp(index + 1, nomPrenom, cin, heures));
        }
        if (lignes.isEmpty()) {
            throw new HeuresSuppImportException("Le fichier ne contient aucune ligne d'heures supplémentaires.");
        }
        return new FichierHeuresSupp(lignes, lignesZero, totalLignes);
    }

    private static String normaliser(String valeur) {
        if (valeur == null) {
            return "";
        }
        return Normalizer.normalize(valeur, Normalizer.Form.NFD).replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9/ ]", "").strip().replaceAll(" +", " ");
    }

    private static boolean estVide(Row ligne) {
        if (ligne == null) {
            return true;
        }
        for (int c = Math.max(0, ligne.getFirstCellNum()); c < ligne.getLastCellNum(); c++) {
            if (!texte(ligne.getCell(c)).isBlank()) {
                return false;
            }
        }
        return true;
    }

    private static String texte(Cell cellule) {
        if (cellule == null) {
            return "";
        }
        String valeur = FORMATTEUR.formatCellValue(cellule);
        return valeur == null ? "" : valeur.strip();
    }

    private static BigDecimal nombre(Cell cellule) {
        if (cellule == null) {
            return null;
        }
        try {
            CellType type = cellule.getCellType() == CellType.FORMULA ? cellule.getCachedFormulaResultType() : cellule.getCellType();
            if (type == CellType.NUMERIC) {
                return BigDecimal.valueOf(cellule.getNumericCellValue()).stripTrailingZeros();
            }
            String valeur = FORMATTEUR.formatCellValue(cellule).replaceAll("[\\s\\u00A0\\u202F]", "").replace(',', '.');
            return valeur.isEmpty() ? null : new BigDecimal(valeur).stripTrailingZeros();
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("valeur P/H invalide en " + cellule.getAddress() + ".", e);
        }
    }
}

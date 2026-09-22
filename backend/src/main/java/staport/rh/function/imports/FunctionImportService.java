package staport.rh.function.imports;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import staport.rh.function.entities.Function;
import staport.rh.function.imports.FunctionImportResultDto.LigneIgnoreeDto;
import staport.rh.function.repositories.FunctionRepository;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Import d'un fichier Excel à une seule colonne (libellé de fonction, une ligne d'en-tête).
 * Import atomique : soit toutes les lignes valides sont créées, soit rien n'est créé — une seule
 * ligne invalide (doublon, trop longue) rejette tout le fichier. Le résultat détaille toujours
 * chaque ligne en cause, même en cas de rejet complet, pour permettre une correction ciblée.
 */
@Service
public class FunctionImportService {

    private static final Logger log = LoggerFactory.getLogger(FunctionImportService.class);
    private static final int MAX_LIBELLE_LENGTH = 100;
    private static final DataFormatter DATA_FORMATTER = new DataFormatter();

    private final FunctionRepository repository;

    public FunctionImportService(FunctionRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public FunctionImportResultDto importer(MultipartFile file) {
        List<LigneIgnoreeDto> lignesIgnorees = new ArrayList<>();
        List<Function> aCreer = new ArrayList<>();
        Set<String> libellesTraites = new HashSet<>();
        int totalLignes = 0;

        try (InputStream is = file.getInputStream(); Workbook workbook = new XSSFWorkbook(is)) {
            Sheet sheet = workbook.getSheetAt(0);
            int numeroLigne = 0;

            for (Row row : sheet) {
                numeroLigne++;
                if (numeroLigne == 1) {
                    continue;
                }

                String libelle = getCellAsString(row.getCell(0));
                if (libelle == null || libelle.isBlank()) {
                    continue;
                }
                libelle = libelle.trim();
                totalLignes++;

                if (libelle.length() > MAX_LIBELLE_LENGTH) {
                    lignesIgnorees.add(new LigneIgnoreeDto(numeroLigne, libelle,
                            "Libellé trop long (max " + MAX_LIBELLE_LENGTH + " caractères)"));
                    continue;
                }

                String cle = libelle.toLowerCase();
                if (libellesTraites.contains(cle) || repository.existsByLibelleIgnoreCase(libelle)) {
                    lignesIgnorees.add(new LigneIgnoreeDto(numeroLigne, libelle, "Fonction déjà existante"));
                    continue;
                }

                libellesTraites.add(cle);
                Function fonction = new Function();
                fonction.setLibelle(libelle);
                aCreer.add(fonction);
            }
        } catch (IOException | RuntimeException e) {
            throw new FunctionImportException("Fichier Excel illisible : " + e.getMessage());
        }

        if (!lignesIgnorees.isEmpty()) {
            log.warn("Import fonctions rejeté : {} ligne(s) invalide(s) sur {}, aucune fonction créée",
                    lignesIgnorees.size(), totalLignes);
            return new FunctionImportResultDto(totalLignes, 0, lignesIgnorees.size(), lignesIgnorees);
        }

        repository.saveAll(aCreer);
        log.info("Import fonctions terminé : total={}, créées={}", totalLignes, aCreer.size());

        return new FunctionImportResultDto(totalLignes, aCreer.size(), 0, lignesIgnorees);
    }

    private String getCellAsString(Cell cell) {
        if (cell == null) {
            return null;
        }
        return DATA_FORMATTER.formatCellValue(cell);
    }

    /**
     * Génère un fichier Excel vierge respectant le format attendu par {@link #importer} — une seule
     * colonne, en-tête "Fonction" — pour que l'utilisateur parte d'un fichier valide plutôt que de
     * deviner le format. Aucune ligne d'exemple : une valeur d'exemple qui ressemblerait à une vraie
     * fonction risquerait d'être importée par erreur si l'utilisateur oublie de la retirer.
     */
    public ByteArrayInputStream genererModele() {
        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream sortie = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("Fonctions");
            sheet.createRow(0).createCell(0).setCellValue("Fonction");
            sheet.setColumnWidth(0, 6000);

            workbook.write(sortie);
            return new ByteArrayInputStream(sortie.toByteArray());
        } catch (IOException e) {
            throw new UncheckedIOException("Erreur lors de la génération du modèle d'import : " + e.getMessage(), e);
        }
    }
}

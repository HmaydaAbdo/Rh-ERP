package staport.rh.equipe.imports;

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
import staport.rh.audit.annotations.AuditableAction;
import staport.rh.audit.entities.TypeOperation;
import staport.rh.equipe.audit.PerimetreImportEquipe;
import staport.rh.equipe.entities.Equipe;
import staport.rh.equipe.repositories.EquipeRepository;
import staport.rh.equipe.imports.EquipeImportResultDto.LigneIgnoreeDto;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Service
public class EquipeImportService {
    private static final Logger log = LoggerFactory.getLogger(EquipeImportService.class);
    private static final int MAX_CODE_LENGTH = 50;
    private static final int MAX_LIBELLE_LENGTH = 100;
    private static final DataFormatter FORMATTER = new DataFormatter();

    private final EquipeRepository repository;

    public EquipeImportService(EquipeRepository repository) {
        this.repository = repository;
    }

    @Transactional
    @AuditableAction(action = "EQUIPE_IMPORT", type = TypeOperation.CREATE, entite = Equipe.class, perimetre = PerimetreImportEquipe.class)
    public EquipeImportResultDto importer(MultipartFile file) {
        List<LigneIgnoreeDto> ignorees = new ArrayList<>();
        List<Equipe> aCreer = new ArrayList<>();
        Set<String> codesFichier = new HashSet<>();
        Set<String> libellesFichier = new HashSet<>();
        Set<String> codesExistants = new HashSet<>();
        Set<String> libellesExistants = new HashSet<>();
        for (Object[] valeurs : repository.findAllCodesAndLibelles()) {
            codesExistants.add(normaliser((String) valeurs[0]));
            libellesExistants.add(normaliser((String) valeurs[1]));
        }

        int total = 0;
        try (InputStream input = file.getInputStream(); Workbook workbook = new XSSFWorkbook(input)) {
            if (workbook.getNumberOfSheets() == 0) {
                throw new EquipeImportException("Le classeur ne contient aucune feuille.");
            }
            Sheet sheet = workbook.getSheetAt(0);
            Row entete = sheet.getRow(0);
            if (entete == null || !"CODE".equals(normaliser(FORMATTER.formatCellValue(entete.getCell(0))))
                    || !"LIBELLÉ".equals(normaliser(FORMATTER.formatCellValue(entete.getCell(1))))
                    || !estVide(entete, 2)) {
                throw new EquipeImportException("Format invalide : les colonnes attendues sont « Code » et « Libellé », dans cet ordre.");
            }

            for (int index = 1; index <= sheet.getLastRowNum(); index++) {
                Row row = sheet.getRow(index);
                String code = cellule(row, 0).strip();
                String libelle = cellule(row, 1).strip();
                if (code.isBlank() && libelle.isBlank() && estVide(row, 2)) {
                    continue;
                }
                total++;
                String raison = null;
                if (code.isBlank()) {
                    raison = "Code obligatoire";
                } else if (libelle.isBlank()) {
                    raison = "Libellé obligatoire";
                } else if (code.length() > MAX_CODE_LENGTH) {
                    raison = "Code trop long (max 50 caractères)";
                } else if (libelle.length() > MAX_LIBELLE_LENGTH) {
                    raison = "Libellé trop long (max 100 caractères)";
                } else if (!estVide(row, 2)) {
                    raison = "Colonnes supplémentaires non prises en charge";
                } else if (codesFichier.contains(normaliser(code))) {
                    raison = "Code déjà présent dans le fichier";
                } else if (libellesFichier.contains(normaliser(libelle))) {
                    raison = "Libellé déjà présent dans le fichier";
                } else if (codesExistants.contains(normaliser(code))) {
                    raison = "Code d'équipe déjà existant";
                } else if (libellesExistants.contains(normaliser(libelle))) {
                    raison = "Libellé d'équipe déjà existant";
                }
                if (raison != null) {
                    ignorees.add(new LigneIgnoreeDto(index + 1, code, libelle, raison));
                    continue;
                }
                codesFichier.add(normaliser(code));
                libellesFichier.add(normaliser(libelle));
                Equipe equipe = new Equipe();
                equipe.setCode(code.toUpperCase(Locale.ROOT));
                equipe.setLibelle(libelle);
                aCreer.add(equipe);
            }
        } catch (EquipeImportException e) {
            throw e;
        } catch (IOException | RuntimeException e) {
            throw new EquipeImportException("Fichier Excel illisible ou invalide : " + e.getMessage());
        }

        if (!ignorees.isEmpty()) {
            log.warn("Import équipes rejeté : {} ligne(s) invalide(s) sur {}, aucune équipe créée", ignorees.size(), total);
            return new EquipeImportResultDto(total, 0, ignorees.size(), ignorees);
        }
        if (!aCreer.isEmpty()) {
            repository.saveAll(aCreer);
        }
        log.info("Import équipes terminé : total={}, créées={}", total, aCreer.size());
        return new EquipeImportResultDto(total, aCreer.size(), 0, ignorees);
    }

    public ByteArrayInputStream genererModele() {
        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("Équipes");
            Row header = sheet.createRow(0);
            header.createCell(0).setCellValue("Code");
            header.createCell(1).setCellValue("Libellé");
            sheet.setColumnWidth(0, 5000);
            sheet.setColumnWidth(1, 9000);
            workbook.write(output);
            return new ByteArrayInputStream(output.toByteArray());
        } catch (IOException e) {
            throw new UncheckedIOException("Erreur lors de la génération du modèle d'import", e);
        }
    }

    private static String cellule(Row row, int index) {
        return row == null || row.getCell(index) == null ? "" : FORMATTER.formatCellValue(row.getCell(index));
    }

    private static boolean estVide(Row row, int debut) {
        if (row == null) return true;
        for (int index = debut; index < row.getLastCellNum(); index++) {
            if (!cellule(row, index).isBlank()) return false;
        }
        return true;
    }

    private static String normaliser(String valeur) {
        return valeur == null ? "" : valeur.strip().toUpperCase(Locale.ROOT);
    }
}

package staport.rh.employee.imports;

import jakarta.persistence.EntityManager;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.DateUtil;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import staport.rh.employee.audit.PerimetreImportEmployee;
import staport.rh.audit.entities.TypeOperation;
import staport.rh.audit.annotations.AuditableAction;
import staport.rh.chantier.entities.Chantier;
import staport.rh.chantier.services.interfaces.IChantierService;
import staport.rh.employee.entities.Employee;
import staport.rh.employee.entities.EmployeeStatut;
import staport.rh.employee.imports.EmployeeImportResultDto.LigneIgnoreeDto;
import staport.rh.employee.repositories.EmployeeRepository;
import staport.rh.function.entities.Function;
import staport.rh.function.services.interfaces.IFunctionService;
import staport.rh.common.recherche.PageLoader;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Import d'un fichier Excel employés (colonnes : Date d'embauche, Nom &amp; prénom, CIN, Fonction,
 * Chantier, Date de naissance — une ligne d'en-tête). L'employé est identifié par son CIN. L'import ne
 * sert qu'à **ajouter** de nouveaux employés : il ne modifie jamais un employé existant (décision du
 * 2026-10-03, toute modification se fait depuis l'écran Employés) — une ligne dont le CIN existe déjà en
 * base est rejetée. Les employés créés sont toujours actifs.
 * Import atomique : soit toutes les lignes sont créées, soit rien n'est persisté — une seule ligne
 * invalide rejette tout le fichier. Le résultat détaille toujours chaque ligne en cause, même en cas de
 * rejet complet. Fonction et Chantier sont résolus par libellé/code parmi les référentiels existants
 * (Chantier doit en plus être actif) — ils doivent exister au préalable (import Function, synchronisation
 * Chantier ou saisie manuelle) ; l'import Employee ne crée jamais de Fonction ni de Chantier
 * automatiquement.
 *
 * Le statut (actif/inactif) n'est pas une colonne de ce format — il ne peut être modifié en masse
 * par cet import, uniquement via l'UI (formulaire) ligne par ligne.
 */
@Service
public class EmployeeImportService {

    private static final Logger log = LoggerFactory.getLogger(EmployeeImportService.class);
    private static final int COLONNES_ATTENDUES = 6;
    private static final int MAX_NOM_PRENOM_LENGTH = 150;
    private static final int MAX_CIN_LENGTH = 30;
    private static final DataFormatter DATA_FORMATTER = new DataFormatter();

    private final EmployeeRepository repository;
    private final IFunctionService functionService;
    private final IChantierService chantierService;
    private final EntityManager entityManager;

    public EmployeeImportService(EmployeeRepository repository,
                                  IFunctionService functionService,
                                  IChantierService chantierService,
                                  EntityManager entityManager) {
        this.repository = repository;
        this.functionService = functionService;
        this.chantierService = chantierService;
        this.entityManager = entityManager;
    }

    @Transactional
    @AuditableAction(action = "EMPLOYE_IMPORT", type = TypeOperation.CREATE, entite = Employee.class, perimetre = PerimetreImportEmployee.class)
    public EmployeeImportResultDto importer(MultipartFile file) {
        List<LigneIgnoreeDto> lignesIgnorees = new ArrayList<>();
        List<LigneAAppliquer> aAppliquer = new ArrayList<>();
        Set<String> cinsTraites = new HashSet<>();
        int totalLignes = 0;

        try (InputStream is = file.getInputStream(); Workbook workbook = new XSSFWorkbook(is)) {
            Sheet sheet = workbook.getSheetAt(0);
            validerFormat(sheet);

            Map<String, Long> fonctionsParLibelle = chargerFonctions();
            Map<String, Long> chantiersParCode = chargerChantiersActifs();
            Set<String> cinsExistants = repository.findAllCinsEnMajuscules();

            int numeroLigne = 0;
            for (Row row : sheet) {
                numeroLigne++;
                if (numeroLigne == 1) {
                    continue;
                }
                if (estLigneVide(row)) {
                    continue;
                }
                totalLignes++;

                LocalDate dateEmbauche = getCellAsLocalDate(row.getCell(0));
                String nomPrenom = getCellAsString(row.getCell(1));
                String cin = getCellAsString(row.getCell(2));
                String fonctionLibelle = getCellAsString(row.getCell(3));
                String chantierCode = getCellAsString(row.getCell(4));
                LocalDate dateNaissance = getCellAsLocalDate(row.getCell(5));

                String raison = validerLigne(nomPrenom, cin, dateNaissance, dateEmbauche,
                        fonctionLibelle, chantierCode, cinsTraites, cinsExistants, fonctionsParLibelle, chantiersParCode);

                if (raison != null) {
                    lignesIgnorees.add(new LigneIgnoreeDto(numeroLigne, cin, nomPrenom, raison));
                    continue;
                }

                cinsTraites.add(normaliserCle(cin));

                aAppliquer.add(new LigneAAppliquer(
                        nomPrenom.strip(),
                        cin.strip(),
                        dateNaissance,
                        dateEmbauche,
                        fonctionsParLibelle.get(normaliserCle(fonctionLibelle)),
                        chantiersParCode.get(normaliserCle(chantierCode))));
            }
        } catch (IOException | RuntimeException e) {
            if (e instanceof EmployeeImportException importException) {
                throw importException;
            }
            throw new EmployeeImportException("Fichier Excel illisible : " + e.getMessage());
        }

        if (!lignesIgnorees.isEmpty()) {
            log.warn("Import employés rejeté : {} ligne(s) invalide(s) sur {}, rien persisté",
                    lignesIgnorees.size(), totalLignes);
            return new EmployeeImportResultDto(totalLignes, 0, lignesIgnorees.size(), lignesIgnorees);
        }

        for (LigneAAppliquer ligne : aAppliquer) {
            Employee employe = new Employee();
            employe.setNomPrenom(ligne.nomPrenom());
            employe.setCin(ligne.cin());
            employe.setDateNaissance(ligne.dateNaissance());
            employe.setDateEmbauche(ligne.dateEmbauche());
            employe.setFonction(entityManager.getReference(Function.class, ligne.fonctionId()));
            employe.setChantier(entityManager.getReference(Chantier.class, ligne.chantierId()));
            employe.setStatut(EmployeeStatut.ACTIF);
            repository.save(employe);
        }

        log.info("Import employés terminé : total={}, créés={}", totalLignes, aAppliquer.size());

        return new EmployeeImportResultDto(totalLignes, aAppliquer.size(), 0, lignesIgnorees);
    }

    private record LigneAAppliquer(String nomPrenom, String cin, LocalDate dateNaissance, LocalDate dateEmbauche,
                                    Long fonctionId, Long chantierId) {
    }

    private String validerLigne(String nomPrenom, String cin, LocalDate dateNaissance, LocalDate dateEmbauche,
                                 String fonctionLibelle, String chantierCode, Set<String> cinsTraites,
                                 Set<String> cinsExistants,
                                 Map<String, Long> fonctionsParLibelle, Map<String, Long> chantiersParCode) {
        List<String> champsManquants = new ArrayList<>();
        if (nomPrenom == null || nomPrenom.isBlank()) {
            champsManquants.add("Nom & prénom");
        }
        if (cin == null || cin.isBlank()) {
            champsManquants.add("CIN");
        }
        if (dateNaissance == null) {
            champsManquants.add("Date de naissance");
        }
        if (dateEmbauche == null) {
            champsManquants.add("Date d'embauche");
        }
        if (fonctionLibelle == null || fonctionLibelle.isBlank()) {
            champsManquants.add("Fonction");
        }
        if (chantierCode == null || chantierCode.isBlank()) {
            champsManquants.add("Chantier");
        }
        if (!champsManquants.isEmpty()) {
            return "Champs obligatoires manquants ou invalides : " + String.join(", ", champsManquants);
        }

        if (nomPrenom.strip().length() > MAX_NOM_PRENOM_LENGTH || cin.strip().length() > MAX_CIN_LENGTH) {
            return "Nom/prénom ou CIN trop long";
        }

        String cinNormalise = normaliserCle(cin);
        if (cinsTraites.contains(cinNormalise)) {
            return "CIN en doublon dans le fichier";
        }
        if (cinsExistants.contains(cinNormalise)) {
            return "Un employé existe déjà avec ce CIN (à modifier depuis l'écran Employés)";
        }

        if (!fonctionsParLibelle.containsKey(normaliserCle(fonctionLibelle))) {
            return "Fonction introuvable : " + fonctionLibelle.strip();
        }
        if (!chantiersParCode.containsKey(normaliserCle(chantierCode))) {
            return "Chantier introuvable ou inactif : " + chantierCode.strip();
        }

        return null;
    }

    private void validerFormat(Sheet sheet) {
        if (sheet == null || sheet.getPhysicalNumberOfRows() == 0) {
            throw new EmployeeImportException("Fichier vide.");
        }
        Row header = sheet.getRow(sheet.getFirstRowNum());
        int colonnesRenseignees = header == null ? 0 : header.getLastCellNum();
        if (colonnesRenseignees < COLONNES_ATTENDUES) {
            throw new EmployeeImportException(
                    "Format de fichier invalide : " + COLONNES_ATTENDUES + " colonnes attendues "
                            + "(Date d'embauche, Nom & prénom, CIN, Fonction, Chantier, Date de naissance), "
                            + colonnesRenseignees + " trouvée(s).");
        }
    }

    private Map<String, Long> chargerFonctions() {
        Map<String, Long> resultat = new HashMap<>();
        PageLoader.forEach(pageable -> functionService.search(null, pageable),
                fonction -> resultat.put(normaliserCle(fonction.libelle()), fonction.id()));
        return resultat;
    }

    private Map<String, Long> chargerChantiersActifs() {
        Map<String, Long> resultat = new HashMap<>();
        PageLoader.forEach(pageable -> chantierService.search(null, pageable), chantier -> {
            if (chantier.actif()) {
                resultat.put(normaliserCle(chantier.code()), chantier.id());
            }
        });
        return resultat;
    }

    private static String normaliserCle(String valeur) {
        return valeur.strip().toUpperCase(Locale.ROOT);
    }

    private boolean estLigneVide(Row row) {
        if (row == null) {
            return true;
        }
        for (int c = row.getFirstCellNum(); c < row.getLastCellNum(); c++) {
            Cell cell = row.getCell(c);
            if (cell != null && cell.getCellType() != CellType.BLANK
                    && !DATA_FORMATTER.formatCellValue(cell).isBlank()) {
                return false;
            }
        }
        return true;
    }

    private String getCellAsString(Cell cell) {
        if (cell == null) {
            return null;
        }
        String value = DATA_FORMATTER.formatCellValue(cell);
        return value == null || value.isBlank() ? null : value;
    }

    private LocalDate getCellAsLocalDate(Cell cell) {
        if (cell == null) {
            return null;
        }
        try {
            if (cell.getCellType() == CellType.NUMERIC) {
                return DateUtil.getLocalDateTime(cell.getNumericCellValue()).toLocalDate();
            }
        } catch (RuntimeException e) {
            return null;
        }
        return null;
    }

    /**
     * Génère un fichier Excel vierge respectant le format attendu par {@link #importer} — une ligne
     * d'en-tête avec les 6 colonnes attendues, dans l'ordre — pour que l'utilisateur parte d'un
     * fichier valide plutôt que de deviner le format. Aucune ligne d'exemple : une valeur d'exemple
     * risquerait d'être importée par erreur si l'utilisateur oublie de la retirer.
     */
    public ByteArrayInputStream genererModele() {
        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream sortie = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("Employés");
            String[] entetes = {"Date d'embauche", "Nom & prénom", "CIN", "Fonction", "Chantier", "Date de naissance"};
            Row ligneEntete = sheet.createRow(0);
            for (int c = 0; c < entetes.length; c++) {
                ligneEntete.createCell(c).setCellValue(entetes[c]);
                sheet.setColumnWidth(c, 5000);
            }

            workbook.write(sortie);
            return new ByteArrayInputStream(sortie.toByteArray());
        } catch (IOException e) {
            throw new UncheckedIOException("Erreur lors de la génération du modèle d'import : " + e.getMessage(), e);
        }
    }
}

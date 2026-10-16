package staport.rh.paie.imports;

import jakarta.persistence.EntityManager;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
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
import staport.rh.paie.audit.PerimetreImportPaie;
import staport.rh.audit.entities.TypeOperation;
import staport.rh.audit.annotations.AuditableAction;
import staport.rh.chantier.entities.Chantier;
import staport.rh.chantier.services.interfaces.IChantierService;
import staport.rh.employee.entities.Employee;
import staport.rh.employee.services.interfaces.IEmployeeService;
import staport.rh.equipe.entities.Equipe;
import staport.rh.equipe.services.interfaces.IEquipeService;
import staport.rh.function.dtos.request.FunctionCreateRequestDto;
import staport.rh.function.dtos.response.FunctionResponseDto;
import staport.rh.function.entities.Function;
import staport.rh.function.services.interfaces.IFunctionService;
import staport.rh.paie.entities.Paie;
import staport.rh.paie.imports.PaieImportResultDto.LigneIgnoreeDto;
import staport.rh.paie.repositories.PaieRepository;
import staport.rh.common.recherche.PageLoader;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Import d'un fichier Excel de paie pour une période donnée (colonnes : Nom &amp; prénom, Fonction,
 * CIN, Nbre jours travaillés, J.R.O, J.R.D, Salaire, Prime roulage ordinaire, Prime roulage
 * dimanche, Total [repris tel quel, jamais recalculé], Observation, Chantier, Équipe — trois lignes d'en-tête,
 * format hérité de paie_old). La période s'applique à tout le fichier, elle n'est pas une colonne.
 *
 * Contrairement à l'import Employee (qui crée les employés), l'import Paie exige que l'employé
 * (par CIN), le chantier et l'équipe (par code, optionnelle mais jamais créée à la volée : un code
 * inconnu rejette la ligne) existent déjà — il ne fait que constater/historiser une paie. La
 * **fonction** fait exception : une fonction inconnue n'est plus une erreur, elle est **créée**
 * automatiquement (comme le ferait un import Function), jamais l'employé ni le chantier. Import
 * atomique : soit toutes les lignes sont créées (et les fonctions manquantes créées), soit rien n'est
 * persisté — une seule ligne invalide rejette tout le fichier. L'import ne **modifie jamais** un
 * bulletin existant : une ligne dont (employé, période) existe déjà est rejetée, la correction d'un
 * bulletin se fait uniquement depuis l'écran Paie.
 */
@Service
public class PaieImportService {

    private static final Logger log = LoggerFactory.getLogger(PaieImportService.class);
    private static final int LIGNES_ENTETE = 3;
    private static final BigDecimal MAX_JOURS_TRAVAILLES = new BigDecimal("999.99");
    private static final DataFormatter DATA_FORMATTER = new DataFormatter();

    private final PaieRepository repository;
    private final IEmployeeService employeeService;
    private final IFunctionService functionService;
    private final IChantierService chantierService;
    private final IEquipeService equipeService;
    private final EntityManager entityManager;

    public PaieImportService(PaieRepository repository,
                              IEmployeeService employeeService,
                              IFunctionService functionService,
                              IChantierService chantierService,
                              IEquipeService equipeService,
                              EntityManager entityManager) {
        this.repository = repository;
        this.employeeService = employeeService;
        this.functionService = functionService;
        this.chantierService = chantierService;
        this.equipeService = equipeService;
        this.entityManager = entityManager;
    }

    @Transactional
    @AuditableAction(action = "PAIE_IMPORT", type = TypeOperation.CREATE, entite = Paie.class, perimetre = PerimetreImportPaie.class)
    public PaieImportResultDto importer(MultipartFile file, YearMonth periode) {
        List<LigneIgnoreeDto> lignesIgnorees = new ArrayList<>();
        List<LigneAAppliquer> aAppliquer = new ArrayList<>();
        int totalLignes = 0;

        try (InputStream is = file.getInputStream(); Workbook workbook = new XSSFWorkbook(is)) {
            Sheet sheet = workbook.getSheetAt(0);

            Map<String, Long> employesParCin = chargerEmployesParCin();
            Map<String, Long> chantiersParCode = chargerChantiersActifs();
            Map<String, Long> equipesParCode = chargerEquipesParCode();
            Set<Long> employesAvecBulletin = repository.findEmployeeIdsByPeriode(periode);
            Set<String> cinsTraites = new LinkedHashSet<>();

            int numeroLigne = 0;
            for (Row row : sheet) {
                numeroLigne++;
                if (numeroLigne <= LIGNES_ENTETE) {
                    continue;
                }
                if (estLigneVide(row)) {
                    continue;
                }

                String cin = getCellAsString(row.getCell(2));
                totalLignes++;

                String nomPrenom = getCellAsString(row.getCell(0));
                String fonctionLibelle = getCellAsString(row.getCell(1));
                BigDecimal nombreJoursTravailles = getCellAsBigDecimal(row.getCell(3));
                BigDecimal joursRecuperationOuvrable = getCellAsBigDecimal(row.getCell(4));
                BigDecimal joursRecuperationDimanche = getCellAsBigDecimal(row.getCell(5));
                BigDecimal salaireMensuel = getCellAsBigDecimal(row.getCell(6));
                BigDecimal primeRoulageOrdinaire = getCellAsBigDecimal(row.getCell(7));
                BigDecimal primeRoulageDimanche = getCellAsBigDecimal(row.getCell(8));
                BigDecimal salaireTotal = getCellAsBigDecimal(row.getCell(9));
                String observation = getCellAsString(row.getCell(10));
                String chantierCode = getCellAsString(row.getCell(11));
                String equipe = getCellAsString(row.getCell(12));

                String raison = validerLigne(cin, fonctionLibelle, chantierCode, equipe, nombreJoursTravailles,
                        joursRecuperationOuvrable, joursRecuperationDimanche, salaireMensuel,
                        primeRoulageOrdinaire, primeRoulageDimanche, salaireTotal, observation,
                        cinsTraites, employesParCin, chantiersParCode, equipesParCode, employesAvecBulletin);

                if (raison != null) {
                    lignesIgnorees.add(new LigneIgnoreeDto(numeroLigne, cin, nomPrenom, raison));
                    continue;
                }

                cinsTraites.add(normaliserCle(cin));
                Long employeeId = employesParCin.get(normaliserCle(cin));
                aAppliquer.add(new LigneAAppliquer(employeeId, fonctionLibelle.strip(),
                        chantiersParCode.get(normaliserCle(chantierCode)),
                        equipe != null ? equipesParCode.get(normaliserCle(equipe)) : null, nombreJoursTravailles, joursRecuperationOuvrable, joursRecuperationDimanche,
                        salaireMensuel, primeRoulageOrdinaire, primeRoulageDimanche,salaireTotal,observation));
            }
        } catch (IOException | RuntimeException e) {
            if (e instanceof PaieImportException importException) {
                throw importException;
            }
            throw new PaieImportException("Fichier Excel illisible : " + e.getMessage());
        }

        if (!lignesIgnorees.isEmpty()) {
            log.warn("Import paie rejeté : periode={}, {} ligne(s) invalide(s) sur {}, rien persisté",
                    periode, lignesIgnorees.size(), totalLignes);
            return new PaieImportResultDto(periode, totalLignes, 0, lignesIgnorees.size(), lignesIgnorees, List.of());
        }

        // La création des fonctions manquantes ne se fait qu'ici, une fois le fichier entier confirmé
        // valide : une fonction créée plus tôt resterait en base même si l'import est rejeté ensuite.
        Map<String, Long> fonctionsParLibelle = chargerFonctions();
        List<String> fonctionsCreees = creerFonctionsManquantes(aAppliquer, fonctionsParLibelle);

        for (LigneAAppliquer ligne : aAppliquer) {
            Long fonctionId = fonctionsParLibelle.get(normaliserCle(ligne.fonctionLibelle()));

            Paie paie = new Paie();
            paie.setEmployee(entityManager.getReference(Employee.class, ligne.employeeId()));
            paie.setPeriode(periode);
            paie.setFonction(entityManager.getReference(Function.class, fonctionId));
            paie.setChantier(entityManager.getReference(Chantier.class, ligne.chantierId()));
            paie.setEquipe(ligne.equipeId() != null ? entityManager.getReference(Equipe.class, ligne.equipeId()) : null);
            paie.setNombreJoursTravailles(ligne.nombreJoursTravailles());
            paie.setJoursRecuperationOuvrable(ligne.joursRecuperationOuvrable());
            paie.setJoursRecuperationDimanche(ligne.joursRecuperationDimanche());
            paie.setSalaireMensuel(ligne.salaireMensuel());
            paie.setPrimeRoulageOrdinaire(ligne.primeRoulageOrdinaire());
            paie.setPrimeRoulageDimanche(ligne.primeRoulageDimanche());
            paie.setSalaireTotal(ligne.salaireTotal());
            paie.setObservation(ligne.observation());

            repository.save(paie);
        }

        log.info("Import paie terminé : periode={}, total={}, créés={}, fonctionsCreees={}",
                periode, totalLignes, aAppliquer.size(), fonctionsCreees.size());

        return new PaieImportResultDto(periode, totalLignes, aAppliquer.size(), 0, lignesIgnorees, fonctionsCreees);
    }

    /**
     * Crée, via la façade {@link IFunctionService}, chaque libellé de fonction référencé par le
     * fichier et absent du référentiel — jamais l'employé ni le chantier, qui doivent toujours
     * préexister. Met à jour {@code fonctionsParLibelle} en place pour que la boucle de persistance
     * puisse résoudre l'id de chaque fonction, nouvelle ou existante, de la même façon.
     */
    private List<String> creerFonctionsManquantes(List<LigneAAppliquer> aAppliquer, Map<String, Long> fonctionsParLibelle) {
        Set<String> libellesACreer = new LinkedHashSet<>();
        for (LigneAAppliquer ligne : aAppliquer) {
            String cle = normaliserCle(ligne.fonctionLibelle());
            if (!fonctionsParLibelle.containsKey(cle)) {
                libellesACreer.add(ligne.fonctionLibelle());
            }
        }

        List<String> creees = new ArrayList<>();
        for (String libelle : libellesACreer) {
            FunctionResponseDto fonction = functionService.create(new FunctionCreateRequestDto(libelle));
            fonctionsParLibelle.put(normaliserCle(libelle), fonction.id());
            creees.add(libelle);
        }
        return creees;
    }

    private record LigneAAppliquer(Long employeeId, String fonctionLibelle, Long chantierId, Long equipeId,
                                    BigDecimal nombreJoursTravailles, BigDecimal joursRecuperationOuvrable,
                                    BigDecimal joursRecuperationDimanche, BigDecimal salaireMensuel,
                                    BigDecimal primeRoulageOrdinaire, BigDecimal primeRoulageDimanche,BigDecimal salaireTotal,
                                    String observation) {
    }

    private String validerLigne(String cin, String fonctionLibelle, String chantierCode, String equipeCode,
                                 BigDecimal nombreJoursTravailles, BigDecimal joursRecuperationOuvrable,
                                 BigDecimal joursRecuperationDimanche, BigDecimal salaireMensuel,
                                 BigDecimal primeRoulageOrdinaire, BigDecimal primeRoulageDimanche,
                                 BigDecimal salaireTotal, String observation,
                                 Set<String> cinsTraites, Map<String, Long> employesParCin,
                                 Map<String, Long> chantiersParCode, Map<String, Long> equipesParCode,
                                 Set<Long> employesAvecBulletin) {
        List<String> champsManquants = new ArrayList<>();
        if (cin == null || cin.isBlank()) {
            champsManquants.add("CIN");
        }
        if (fonctionLibelle == null || fonctionLibelle.isBlank()) {
            champsManquants.add("Fonction");
        }
        if (nombreJoursTravailles == null) {
            champsManquants.add("Nombre de jours travaillés");
        }
        if (salaireMensuel == null) {
            champsManquants.add("Salaire mensuel");
        }
        if (salaireTotal == null) {
            champsManquants.add("Total");
        }
        if (chantierCode == null || chantierCode.isBlank()) {
            champsManquants.add("Chantier");
        }
        if (!champsManquants.isEmpty()) {
            return "Champs obligatoires manquants ou invalides : " + String.join(", ", champsManquants);
        }

        if (nombreJoursTravailles.signum() < 0 || estNegatif(joursRecuperationOuvrable)
                || estNegatif(joursRecuperationDimanche) || estNegatif(salaireMensuel)
                || estNegatif(primeRoulageOrdinaire) || estNegatif(primeRoulageDimanche)
                || estNegatif(salaireTotal)) {
            return "Les jours, salaires et primes doivent être positifs ou nuls";
        }
        if (estJourTravailleInvalide(nombreJoursTravailles)) {
            return "Le nombre de jours travaillés doit être compris entre 0 et 999,99 avec au plus deux décimales";
        }
        if (observation != null && observation.length() > 255) {
            return "Observation trop longue (255 caractères maximum)";
        }

        String cinNormalise = normaliserCle(cin);
        if (cinsTraites.contains(cinNormalise)) {
            return "CIN en doublon dans le fichier";
        }
        if (!employesParCin.containsKey(cinNormalise)) {
            return "Employé introuvable avec ce CIN";
        }
        if (employesAvecBulletin.contains(employesParCin.get(cinNormalise))) {
            return "Un bulletin existe déjà pour cet employé sur cette période (à modifier depuis l'écran Paie)";
        }
        if (!chantiersParCode.containsKey(normaliserCle(chantierCode))) {
            return "Chantier introuvable ou inactif : " + chantierCode.strip();
        }
        if (equipeCode != null && !equipesParCode.containsKey(normaliserCle(equipeCode))) {
            return "Équipe introuvable : " + equipeCode.strip();
        }

        return null;
    }

    private boolean estNegatif(BigDecimal valeur) {
        return valeur != null && valeur.signum() < 0;
    }

    private boolean estJourTravailleInvalide(BigDecimal valeur) {
        BigDecimal normalisee = valeur.stripTrailingZeros();
        return normalisee.scale() > 2 || valeur.compareTo(MAX_JOURS_TRAVAILLES) > 0;
    }

    private Map<String, Long> chargerEmployesParCin() {
        Map<String, Long> resultat = new HashMap<>();
        PageLoader.forEach(pageable -> employeeService.search(null, pageable),
                employee -> resultat.put(normaliserCle(employee.cin()), employee.id()));
        return resultat;
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

    private Map<String, Long> chargerEquipesParCode() {
        Map<String, Long> resultat = new HashMap<>();
        PageLoader.forEach(pageable -> equipeService.search(null, pageable),
                equipe -> resultat.put(normaliserCle(equipe.code()), equipe.id()));
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

    private BigDecimal getCellAsBigDecimal(Cell cell) {
        if (cell == null) {
            return null;
        }
        try {
            // Cellule de formule (ex. =G5*D5) : on lit le résultat mis en cache par Excel, pas le texte formaté.
            CellType type = cell.getCellType() == CellType.FORMULA ? cell.getCachedFormulaResultType() : cell.getCellType();
            if (type == CellType.NUMERIC) {
                return BigDecimal.valueOf(cell.getNumericCellValue());
            }
            String value = DATA_FORMATTER.formatCellValue(cell).replaceAll("[\\s\\u00A0\\u202F]", "");
            return value.isEmpty() ? null : new BigDecimal(value);
        } catch (RuntimeException e) {
            return null;
        }
    }

    /**
     * Génère un fichier Excel vierge respectant le format attendu par {@link #importer} — trois
     * lignes d'en-tête (héritées de l'ancien format), colonnes dans l'ordre attendu — pour que
     * l'utilisateur parte d'un fichier valide plutôt que de deviner le format., pour ne
     * pas décaler les colonnes suivantes (Observation, Chantier, Équipe) par rapport aux fichiers
     * mensuels déjà utilisés.
     */
    public ByteArrayInputStream genererModele() {
        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream sortie = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("Paie");
            sheet.createRow(0);
            sheet.createRow(1);
            String[] entetes = {
                    "Nom & prénom", "Fonction", "CIN", "Nbre Jrs", "J.R.O", "J.R.D", "Salaire",
                    "Prime RO", "Prime RD", "Total", "Observation", "Chantier", "Équipe"
            };
            Row ligneEntete = sheet.createRow(2);
            for (int c = 0; c < entetes.length; c++) {
                ligneEntete.createCell(c).setCellValue(entetes[c]);
                sheet.setColumnWidth(c, 4500);
            }

            workbook.write(sortie);
            return new ByteArrayInputStream(sortie.toByteArray());
        } catch (IOException e) {
            throw new UncheckedIOException("Erreur lors de la génération du modèle d'import : " + e.getMessage(), e);
        }
    }
}

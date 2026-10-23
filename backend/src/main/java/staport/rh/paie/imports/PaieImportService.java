package staport.rh.paie.imports;

import jakarta.persistence.EntityManager;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import staport.rh.audit.annotations.AuditableAction;
import staport.rh.audit.entities.TypeOperation;
import staport.rh.chantier.dtos.response.ChantierResponseDto;
import staport.rh.chantier.entities.Chantier;
import staport.rh.chantier.services.interfaces.IChantierService;
import staport.rh.common.recherche.PageLoader;
import staport.rh.employee.dtos.request.EmployeeCreateRequestDto;
import staport.rh.employee.dtos.request.EmployeeUpdateRequestDto;
import staport.rh.employee.dtos.response.EmployeeResponseDto;
import staport.rh.employee.entities.Employee;
import staport.rh.employee.entities.EmployeeStatut;
import staport.rh.employee.entities.TypeSalaire;
import staport.rh.employee.services.interfaces.IEmployeeService;
import staport.rh.equipe.entities.Equipe;
import staport.rh.equipe.services.interfaces.IEquipeService;
import staport.rh.function.dtos.request.FunctionCreateRequestDto;
import staport.rh.function.entities.Function;
import staport.rh.function.services.interfaces.IFunctionService;
import staport.rh.paie.audit.PerimetreCorrectionImportPaie;
import staport.rh.paie.audit.PerimetreImportPaie;
import staport.rh.paie.entities.Paie;
import staport.rh.paie.imports.PaieImportAnalyseDto.ChampDto;
import staport.rh.paie.imports.PaieImportAnalyseDto.ChantierClotureDto;
import staport.rh.paie.imports.PaieImportAnalyseDto.CinInconnuDto;
import staport.rh.paie.imports.PaieImportAnalyseDto.DepartDto;
import staport.rh.paie.imports.PaieImportAnalyseDto.EcartDto;
import staport.rh.paie.imports.PaieImportAnalyseDto.ErreurDto;
import staport.rh.paie.imports.PaieImportAnalyseDto.RetourDto;
import staport.rh.paie.reporting.ObservationStc;
import staport.rh.paie.repositories.PaieRepository;

import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Import d'un fichier de paie en assistant (voir docs/adr/0010-employe-etat-du-dernier-mois-de-paie.md) : le fichier et les
 * fiches employés doivent dire la même chose avant que les bulletins soient créés.
 *
 * <ol>
 *   <li>{@link #analyser} lit le fichier sans rien enregistrer et rend les problèmes : erreurs du fichier, chantiers
 *   clôturés, CIN inconnus, écarts avec les fiches ; puis les départs (STC, actifs absents) et les retours (inactifs
 *   présents).</li>
 *   <li>{@link #corriger} aligne les fiches choisies sur leur ligne et crée les employés des CIN inconnus ; ce qui reste se
 *   corrige dans le fichier, qu'on réanalyse — autant de fois qu'il faut. Un chantier clôturé se rouvre depuis le domaine
 *   Chantier (droit d'écrire les chantiers), puis on réanalyse.</li>
 *   <li>{@link #importer} n'accepte qu'un fichier sans problème : il crée les bulletins, repasse ACTIF les employés revenus et
 *   enregistre les départs confirmés.</li>
 * </ol>
 *
 * Le serveur ne garde rien entre ces étapes : chacune reçoit le fichier et refait l'analyse. Seul le mois qui suit exactement
 * le dernier mois importé est accepté (n'importe lequel s'il n'y a encore aucune paie). Le bulletin garde les valeurs du
 * fichier — qui sont alors celles de la fiche — et le total est repris tel quel, jamais recalculé.
 */
@Service
public class PaieImportService {

    private static final Logger log = LoggerFactory.getLogger(PaieImportService.class);
    private static final BigDecimal MAX_JOURS_TRAVAILLES = new BigDecimal("999.99");
    private static final int LONGUEUR_NOM_MAX = 150;

    private final PaieRepository repository;
    private final LecteurFichierPaie lecteur;
    private final IEmployeeService employeeService;
    private final IFunctionService functionService;
    private final IChantierService chantierService;
    private final IEquipeService equipeService;
    private final EntityManager entityManager;

    public PaieImportService(PaieRepository repository,
                             LecteurFichierPaie lecteur,
                             IEmployeeService employeeService,
                             IFunctionService functionService,
                             IChantierService chantierService,
                             IEquipeService equipeService,
                             EntityManager entityManager) {
        this.repository = repository;
        this.lecteur = lecteur;
        this.employeeService = employeeService;
        this.functionService = functionService;
        this.chantierService = chantierService;
        this.equipeService = equipeService;
        this.entityManager = entityManager;
    }

    @Transactional(readOnly = true)
    public PaieImportAnalyseDto analyser(MultipartFile fichier, YearMonth periode) {
        verifierMois(periode);
        return examiner(periode, charger(lecteur.lire(fichier), periode)).analyse();
    }

    @Transactional
    @AuditableAction(action = "PAIE_IMPORT_CORRECTION", type = TypeOperation.UPDATE, entite = Employee.class,
            perimetre = PerimetreCorrectionImportPaie.class)
    public PaieImportAnalyseDto corriger(MultipartFile fichier, YearMonth periode, PaieImportCorrectionsDto corrections) {
        verifierMois(periode);
        List<LigneFichierPaie> lignes = lecteur.lire(fichier);
        Contexte contexte = charger(lignes, periode);
        Examen examen = examiner(periode, contexte);

        for (PaieImportCorrectionsDto.Alignement alignement : corrections.aligner()) {
            EcartDto ecart = examen.ecartsParEmploye().get(alignement.employeId());
            if (ecart == null) {
                continue; // déjà aligné (double clic, ou corrigé entre-temps) : rien à faire
            }
            EmployeeResponseDto employe = contexte.employesParCin().get(cle(ecart.cin()));
            aligner(employe, examen.lignesParNumero().get(ecart.numeroLigne()), alignement.typeSalaire(), contexte);
        }
        for (PaieImportCorrectionsDto.Creation creation : corrections.creer()) {
            CinInconnuDto inconnu = examen.inconnusParLigne().get(creation.numeroLigne());
            if (inconnu == null) {
                throw new PaieImportException("La ligne " + creation.numeroLigne() + " n'est pas un CIN inconnu : réanalysez le fichier");
            }
            creer(examen.lignesParNumero().get(creation.numeroLigne()), creation, contexte);
        }

        entityManager.flush();
        return examiner(periode, charger(lignes, periode)).analyse();
    }

    @Transactional
    @AuditableAction(action = "PAIE_IMPORT", type = TypeOperation.CREATE, entite = Paie.class, perimetre = PerimetreImportPaie.class)
    public PaieImportResultDto importer(MultipartFile fichier, YearMonth periode, PaieImportDepartsDto departsConfirmes) {
        verifierMois(periode);
        List<LigneFichierPaie> lignes = lecteur.lire(fichier);
        Contexte contexte = charger(lignes, periode);
        PaieImportAnalyseDto analyse = examiner(periode, contexte).analyse();
        if (!analyse.pret()) {
            throw new PaieImportException("Le fichier n'est pas prêt : " + analyse.erreurs().size() + " erreur(s), "
                    + analyse.chantiersClotures().size() + " chantier(s) clôturé(s), "
                    + analyse.cinInconnus().size() + " CIN inconnu(s), " + analyse.ecarts().size()
                    + " écart(s) avec les fiches. Réanalysez-le.");
        }
        Set<Long> departsProposes = new HashSet<>();
        analyse.departs().forEach(depart -> departsProposes.add(depart.employeId()));
        for (PaieImportDepartsDto.Depart depart : departsConfirmes.departs()) {
            if (!departsProposes.contains(depart.employeId())) {
                throw new PaieImportException("Ce départ n'a pas été proposé par l'analyse du fichier : employé " + depart.employeId());
            }
        }

        for (LigneFichierPaie ligne : lignes) {
            repository.save(bulletin(ligne, periode, contexte));
        }
        for (RetourDto retour : analyse.retours()) {
            EmployeeResponseDto employe = contexte.employesParCin().get(cle(retour.cin()));
            employeeService.update(employe.id(), avecStatut(employe, EmployeeStatut.ACTIF));
        }
        for (PaieImportDepartsDto.Depart depart : departsConfirmes.departs()) {
            employeeService.enregistrerSortie(depart.employeId(), periode, depart.motif());
        }

        log.info("Import paie terminé : periode={}, bulletins={}, departs={}, retours={}",
                periode, lignes.size(), departsConfirmes.departs().size(), analyse.retours().size());
        return new PaieImportResultDto(periode, lignes.size(), departsConfirmes.departs().size(), analyse.retours().size());
    }

    public ByteArrayInputStream genererModele() {
        return lecteur.genererModele();
    }

    /** La paie s'importe mois après mois : seul le mois qui suit le dernier importé est accepté. */
    private void verifierMois(YearMonth periode) {
        YearMonth dernier = repository.findDernierePeriode();
        if (dernier != null && !periode.equals(dernier.plusMonths(1))) {
            throw new PaieImportException("Seul le mois " + dernier.plusMonths(1) + " peut être importé : la paie s'importe mois "
                    + "après mois et le dernier mois importé est " + dernier + ".");
        }
    }

    // ---- Analyse ----

    private record Contexte(List<LigneFichierPaie> lignes, Map<String, EmployeeResponseDto> employesParCin,
                            Map<String, Long> chantiersParCode, Map<Long, ChantierResponseDto> chantiersClotures,
                            Map<String, Long> equipesParCode,
                            Map<String, Long> fonctionsParLibelle, Set<Long> employesAvecBulletin) {
    }

    private record Examen(PaieImportAnalyseDto analyse, Map<Long, EcartDto> ecartsParEmploye,
                          Map<Integer, CinInconnuDto> inconnusParLigne, Map<Integer, LigneFichierPaie> lignesParNumero) {
    }

    /**
     * Les référentiels sont chargés une seule fois, avant la lecture des lignes (aucune requête par ligne). Les chantiers
     * clôturés y figurent aussi : une ligne qui en cite un est signalée à part, pour rouvrir le chantier sans toucher au fichier.
     */
    private Contexte charger(List<LigneFichierPaie> lignes, YearMonth periode) {
        Map<String, EmployeeResponseDto> employes = new HashMap<>();
        PageLoader.forEach(pageable -> employeeService.search(null, pageable), employe -> employes.put(cle(employe.cin()), employe));
        Map<String, Long> chantiers = new HashMap<>();
        Map<Long, ChantierResponseDto> clotures = new HashMap<>();
        PageLoader.forEach(pageable -> chantierService.search(null, pageable), chantier -> {
            chantiers.put(cle(chantier.code()), chantier.id());
            if (!chantier.actif()) {
                clotures.put(chantier.id(), chantier);
            }
        });
        Map<String, Long> equipes = new HashMap<>();
        PageLoader.forEach(pageable -> equipeService.search(null, pageable), equipe -> equipes.put(cle(equipe.code()), equipe.id()));
        Map<String, Long> fonctions = new HashMap<>();
        PageLoader.forEach(pageable -> functionService.search(null, pageable), fonction -> fonctions.put(cle(fonction.libelle()), fonction.id()));
        return new Contexte(lignes, employes, chantiers, clotures, equipes, fonctions, repository.findEmployeeIdsByPeriode(periode));
    }

    private Examen examiner(YearMonth periode, Contexte contexte) {
        List<ErreurDto> erreurs = new ArrayList<>();
        Map<Long, List<Integer>> lignesParChantierCloture = new LinkedHashMap<>();
        List<CinInconnuDto> inconnus = new ArrayList<>();
        List<EcartDto> ecarts = new ArrayList<>();
        List<DepartDto> departs = new ArrayList<>();
        List<RetourDto> retours = new ArrayList<>();
        Map<Integer, LigneFichierPaie> lignesParNumero = new HashMap<>();
        Set<String> cinsDuFichier = new HashSet<>();
        Set<String> cinsTraites = new HashSet<>();

        for (LigneFichierPaie ligne : contexte.lignes()) {
            lignesParNumero.put(ligne.numeroLigne(), ligne);
            if (ligne.cin() != null) {
                cinsDuFichier.add(cle(ligne.cin()));
            }
            String raison = erreurDuFichier(ligne, contexte, cinsTraites);
            if (raison != null) {
                erreurs.add(new ErreurDto(ligne.numeroLigne(), ligne.cin(), ligne.nomPrenom(), raison));
                continue;
            }
            cinsTraites.add(cle(ligne.cin()));
            Long chantierId = contexte.chantiersParCode().get(cle(ligne.chantier()));
            if (contexte.chantiersClotures().containsKey(chantierId)) {
                lignesParChantierCloture.computeIfAbsent(chantierId, id -> new ArrayList<>()).add(ligne.numeroLigne());
            }

            EmployeeResponseDto employe = contexte.employesParCin().get(cle(ligne.cin()));
            if (employe == null) {
                inconnus.add(new CinInconnuDto(ligne.numeroLigne(), ligne.cin().strip(), texte(ligne.nomPrenom()), texte(ligne.fonction()),
                        texte(ligne.chantier()), texte(ligne.equipe()), ligne.salaireMensuel()));
                continue;
            }
            List<ChampDto> champs = champsEnEcart(ligne, employe, contexte);
            if (!champs.isEmpty()) {
                ecarts.add(new EcartDto(employe.id(), ligne.numeroLigne(), employe.cin(), employe.nomPrenom(), champs, employe.typeSalaire()));
            }
            if (ObservationStc.estStcOuSortie(ligne.observation())) {
                departs.add(new DepartDto(employe.id(), employe.cin(), employe.nomPrenom(),
                        ligne.observation().strip().equalsIgnoreCase("stc") ? "STC" : "Sortie"));
            } else if (employe.statut() == EmployeeStatut.INACTIF) {
                retours.add(new RetourDto(employe.id(), employe.cin(), employe.nomPrenom()));
            }
        }

        // Un actif absent du fichier n'est plus payé : il est proposé au départ, motif à saisir.
        contexte.employesParCin().values().stream()
                .filter(employe -> employe.statut() == EmployeeStatut.ACTIF && !cinsDuFichier.contains(cle(employe.cin())))
                .sorted((a, b) -> a.nomPrenom().compareToIgnoreCase(b.nomPrenom()))
                .forEach(employe -> departs.add(new DepartDto(employe.id(), employe.cin(), employe.nomPrenom(), null)));

        List<ChantierClotureDto> chantiersClotures = new ArrayList<>();
        lignesParChantierCloture.forEach((id, numeros) -> {
            ChantierResponseDto chantier = contexte.chantiersClotures().get(id);
            chantiersClotures.add(new ChantierClotureDto(id, chantier.code(), chantier.designation(), numeros));
        });

        boolean pret = erreurs.isEmpty() && chantiersClotures.isEmpty() && inconnus.isEmpty() && ecarts.isEmpty();
        PaieImportAnalyseDto analyse = new PaieImportAnalyseDto(periode, contexte.lignes().size(), erreurs, chantiersClotures,
                inconnus, ecarts, departs, retours, pret);
        Map<Long, EcartDto> ecartsParEmploye = new HashMap<>();
        ecarts.forEach(ecart -> ecartsParEmploye.put(ecart.employeId(), ecart));
        Map<Integer, CinInconnuDto> inconnusParLigne = new HashMap<>();
        inconnus.forEach(inconnu -> inconnusParLigne.put(inconnu.numeroLigne(), inconnu));
        return new Examen(analyse, ecartsParEmploye, inconnusParLigne, lignesParNumero);
    }

    /** Ce que seul le fichier peut corriger ; {@code null} si la ligne est valide. */
    private String erreurDuFichier(LigneFichierPaie ligne, Contexte contexte, Set<String> cinsTraites) {
        List<String> manquants = new ArrayList<>();
        if (ligne.cin() == null) {
            manquants.add("CIN");
        }
        if (ligne.fonction() == null) {
            manquants.add("Fonction");
        }
        if (ligne.nombreJoursTravailles() == null) {
            manquants.add("Nombre de jours travaillés");
        }
        if (ligne.salaireMensuel() == null) {
            manquants.add("Salaire");
        }
        if (ligne.salaireTotal() == null) {
            manquants.add("Total");
        }
        if (ligne.chantier() == null) {
            manquants.add("Chantier");
        }
        if (!manquants.isEmpty()) {
            return "Champs obligatoires manquants ou invalides : " + String.join(", ", manquants);
        }
        if (Objects.requireNonNullElse(ligne.nombreJoursTravailles(), BigDecimal.ZERO).signum() < 0
                || estNegatif(ligne.joursRecuperationOuvrable()) || estNegatif(ligne.joursRecuperationDimanche())
                || estNegatif(ligne.salaireMensuel()) || estNegatif(ligne.primeRoulageOrdinaire())
                || estNegatif(ligne.primeRoulageDimanche()) || estNegatif(ligne.salaireTotal())) {
            return "Les jours, salaires et primes doivent être positifs ou nuls";
        }
        if (ligne.salaireMensuel().signum() == 0) {
            return "Salaire à 0 : chaque ligne porte le salaire de l'employé (ou son STC) ; un employé sans paie ce mois-ci "
                    + "ne figure pas dans le fichier";
        }
        if (estJourTravailleInvalide(ligne.nombreJoursTravailles())) {
            return "Le nombre de jours travaillés doit être compris entre 0 et 999,99 avec au plus deux décimales";
        }
        if (ligne.observation() != null && ligne.observation().length() > 255) {
            return "Observation trop longue (255 caractères maximum)";
        }
        if (ligne.nomPrenom() != null && ligne.nomPrenom().strip().length() > LONGUEUR_NOM_MAX) {
            return "Nom trop long (150 caractères maximum)";
        }
        String cin = cle(ligne.cin());
        if (cinsTraites.contains(cin)) {
            return "CIN en doublon dans le fichier";
        }
        EmployeeResponseDto employe = contexte.employesParCin().get(cin);
        if (employe != null && contexte.employesAvecBulletin().contains(employe.id())) {
            return "Un bulletin existe déjà pour cet employé sur cette période (à modifier depuis l'écran Paie)";
        }
        if (!contexte.chantiersParCode().containsKey(cle(ligne.chantier()))) {
            return "Chantier introuvable : " + ligne.chantier().strip();
        }
        if (ligne.equipe() != null && !contexte.equipesParCode().containsKey(cle(ligne.equipe()))) {
            return "Équipe introuvable : " + ligne.equipe().strip();
        }
        return null;
    }

    /** Les champs où la fiche ne dit pas la même chose que la ligne (nom sans tenir compte de la casse ni des espaces). */
    private List<ChampDto> champsEnEcart(LigneFichierPaie ligne, EmployeeResponseDto employe, Contexte contexte) {
        List<ChampDto> champs = new ArrayList<>();
        if (ligne.nomPrenom() != null && !nom(ligne.nomPrenom()).equals(nom(employe.nomPrenom()))) {
            champs.add(new ChampDto("nomPrenom", employe.nomPrenom(), ligne.nomPrenom().strip()));
        }
        if (!cle(ligne.fonction()).equals(cle(employe.fonction().libelle()))) {
            champs.add(new ChampDto("fonction", employe.fonction().libelle(), ligne.fonction().strip()));
        }
        if (!contexte.chantiersParCode().get(cle(ligne.chantier())).equals(employe.chantier().id())) {
            champs.add(new ChampDto("chantier", employe.chantier().code(), ligne.chantier().strip()));
        }
        Long equipeFichier = ligne.equipe() == null ? null : contexte.equipesParCode().get(cle(ligne.equipe()));
        Long equipeFiche = employe.equipe() == null ? null : employe.equipe().id();
        if (!Objects.equals(equipeFichier, equipeFiche)) {
            champs.add(new ChampDto("equipe", employe.equipe() == null ? null : employe.equipe().code(), texte(ligne.equipe())));
        }
        if (employe.salaire() == null || employe.salaire().compareTo(ligne.salaireMensuel()) != 0) {
            champs.add(new ChampDto("salaire", employe.salaire() == null ? null : employe.salaire().toPlainString(),
                    ligne.salaireMensuel().toPlainString()));
        }
        return champs;
    }

    // ---- Corrections ----

    private void aligner(EmployeeResponseDto employe, LigneFichierPaie ligne, TypeSalaire typeChoisi, Contexte contexte) {
        TypeSalaire type = typeChoisi != null ? typeChoisi : employe.typeSalaire();
        if (type == null) {
            throw new PaieImportException("Choisissez le type de salaire (mensuel ou journalier) de " + employe.nomPrenom());
        }
        employeeService.update(employe.id(), new EmployeeUpdateRequestDto(employe.version(),
                ligne.nomPrenom() != null ? ligne.nomPrenom().strip() : employe.nomPrenom(), employe.cin(),
                employe.dateNaissance(), employe.dateEmbauche(), fonctionId(ligne.fonction(), contexte),
                contexte.chantiersParCode().get(cle(ligne.chantier())), equipeId(ligne, contexte),
                ligne.salaireMensuel(), type, employe.statut()));
    }

    private void creer(LigneFichierPaie ligne, PaieImportCorrectionsDto.Creation creation, Contexte contexte) {
        if (ligne.nomPrenom() == null) {
            throw new PaieImportException("La ligne " + ligne.numeroLigne() + " n'a pas de nom : complétez le fichier");
        }
        if (!creation.dateNaissance().isBefore(LocalDate.now())) {
            throw new PaieImportException("La date de naissance de " + ligne.nomPrenom().strip() + " doit être passée");
        }
        employeeService.create(new EmployeeCreateRequestDto(ligne.nomPrenom().strip(), ligne.cin().strip(),
                creation.dateNaissance(), creation.dateEmbauche(), fonctionId(ligne.fonction(), contexte),
                contexte.chantiersParCode().get(cle(ligne.chantier())), equipeId(ligne, contexte),
                ligne.salaireMensuel(), creation.typeSalaire()));
    }

    /** La fonction du fichier ; absente du référentiel, elle est créée (comme le ferait un import Function). */
    private Long fonctionId(String libelle, Contexte contexte) {
        return contexte.fonctionsParLibelle().computeIfAbsent(cle(libelle),
                c -> functionService.create(new FunctionCreateRequestDto(libelle.strip())).id());
    }

    private static Long equipeId(LigneFichierPaie ligne, Contexte contexte) {
        return ligne.equipe() == null ? null : contexte.equipesParCode().get(cle(ligne.equipe()));
    }

    private static EmployeeUpdateRequestDto avecStatut(EmployeeResponseDto employe, EmployeeStatut statut) {
        return new EmployeeUpdateRequestDto(employe.version(), employe.nomPrenom(), employe.cin(), employe.dateNaissance(),
                employe.dateEmbauche(), employe.fonction().id(), employe.chantier().id(),
                employe.equipe() == null ? null : employe.equipe().id(), employe.salaire(), employe.typeSalaire(), statut);
    }

    // ---- Import ----

    private Paie bulletin(LigneFichierPaie ligne, YearMonth periode, Contexte contexte) {
        EmployeeResponseDto employe = contexte.employesParCin().get(cle(ligne.cin()));
        Long equipeId = employe.equipe() == null ? null : employe.equipe().id();
        Paie paie = new Paie();
        paie.setEmployee(entityManager.getReference(Employee.class, employe.id()));
        paie.setPeriode(periode);
        paie.setFonction(entityManager.getReference(Function.class, contexte.fonctionsParLibelle().get(cle(ligne.fonction()))));
        paie.setChantier(entityManager.getReference(Chantier.class, contexte.chantiersParCode().get(cle(ligne.chantier()))));
        paie.setEquipe(equipeId != null ? entityManager.getReference(Equipe.class, equipeId) : null);
        paie.setNombreJoursTravailles(ligne.nombreJoursTravailles());
        paie.setJoursRecuperationOuvrable(ligne.joursRecuperationOuvrable());
        paie.setJoursRecuperationDimanche(ligne.joursRecuperationDimanche());
        paie.setSalaireMensuel(ligne.salaireMensuel());
        paie.setPrimeRoulageOrdinaire(ligne.primeRoulageOrdinaire());
        paie.setPrimeRoulageDimanche(ligne.primeRoulageDimanche());
        paie.setSalaireTotal(ligne.salaireTotal());
        paie.setObservation(ligne.observation());
        return paie;
    }

    // ---- Outils ----

    private static boolean estNegatif(BigDecimal valeur) {
        return valeur != null && valeur.signum() < 0;
    }

    private static boolean estJourTravailleInvalide(BigDecimal valeur) {
        return valeur.stripTrailingZeros().scale() > 2 || valeur.compareTo(MAX_JOURS_TRAVAILLES) > 0;
    }

    private static String cle(String valeur) {
        return valeur.strip().toUpperCase(Locale.ROOT);
    }

    /** Un nom comparé sans casse, et avec un seul espace entre les mots. */
    private static String nom(String valeur) {
        return cle(valeur).replaceAll("\\s+", " ");
    }

    private static String texte(String valeur) {
        return valeur == null ? null : valeur.strip();
    }
}

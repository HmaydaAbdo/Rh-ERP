package staport.rh.heuresupp.imports;

import jakarta.persistence.EntityManager;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import staport.rh.audit.annotations.AuditableAction;
import staport.rh.audit.entities.TypeOperation;
import staport.rh.chantier.entities.Chantier;
import staport.rh.chantier.services.interfaces.IChantierService;
import staport.rh.employee.dtos.request.EmployeeCreateRequestDto;
import staport.rh.employee.dtos.request.EmployeeUpdateRequestDto;
import staport.rh.employee.dtos.response.EmployeeResponseDto;
import staport.rh.employee.entities.Employee;
import staport.rh.employee.services.interfaces.IEmployeeService;
import staport.rh.function.entities.Function;
import staport.rh.function.dtos.request.FunctionCreateRequestDto;
import staport.rh.function.dtos.request.FunctionSearchCriteria;
import staport.rh.function.services.interfaces.IFunctionService;
import staport.rh.heuresupp.entities.HeureSupp;
import staport.rh.heuresupp.audit.PerimetreCorrectionHeuresSupp;
import staport.rh.heuresupp.audit.PerimetreImportHeuresSupp;
import staport.rh.heuresupp.repositories.HeuresSuppRepository;
import staport.rh.heuresupp.services.CalculHeuresSupp;
import staport.rh.paie.entities.Paie;
import staport.rh.paie.reporting.ObservationStc;
import staport.rh.paie.services.interfaces.IPaieService;

import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Orchestration du wizard : analyse sans écriture, corrections explicites, import atomique par mois et chantier. */
@Service
public class HeuresSuppImportService {

    private static final BigDecimal ZERO = new BigDecimal("0.00");
    private static final String PAIE_ABSENTE = "Aucune paie n'est disponible pour ce mois. Importez d'abord la paie de ce mois, puis recommencez.";

    private final LecteurFichierHeuresSupp lecteur;
    private final HeuresSuppRepository repository;
    private final IEmployeeService employes;
    private final IPaieService paie;
    private final IChantierService chantiers;
    private final IFunctionService fonctions;
    private final EntityManager entityManager;

    public HeuresSuppImportService(LecteurFichierHeuresSupp lecteur, HeuresSuppRepository repository,
                                  IEmployeeService employes, IPaieService paie, IChantierService chantiers,
                                  IFunctionService fonctions, EntityManager entityManager) {
        this.lecteur = lecteur;
        this.repository = repository;
        this.employes = employes;
        this.paie = paie;
        this.chantiers = chantiers;
        this.fonctions = fonctions;
        this.entityManager = entityManager;
    }

    @Transactional(readOnly = true)
    public HeuresSuppImportPrerequisDto verifierPrerequis(YearMonth periode, Long chantierId) {
        if (periode == null || chantierId == null) {
            throw new HeuresSuppImportException("Choisissez un mois et un chantier avant de poursuivre.");
        }
        int bulletins = paie.findPeriodes(null).stream()
                .filter(mois -> periode.toString().equals(mois.periode()))
                .mapToInt(mois -> Math.toIntExact(mois.nombreBulletins())).findFirst().orElse(0);
        if (bulletins == 0) {
            return new HeuresSuppImportPrerequisDto(periode, chantierId, 0, false, PAIE_ABSENTE);
        }
        if (!chantiers.existsById(chantierId)) {
            return new HeuresSuppImportPrerequisDto(periode, chantierId, bulletins, false,
                    "Le chantier sélectionné n'existe plus. Actualisez la liste des chantiers.");
        }
        return new HeuresSuppImportPrerequisDto(periode, chantierId, bulletins, true, null);
    }

    @Transactional(readOnly = true)
    public HeuresSuppImportAnalyseDto analyser(MultipartFile fichier, YearMonth periode, Long chantierId,
                                               HeuresSuppImportForfaitsDto forfaits) {
        verifierPrerequisOuEchec(periode, chantierId);
        return analyser(lecteur.lire(fichier), periode, chantierId, normaliserForfaits(forfaits), false);
    }

    @Transactional
    @AuditableAction(action = "HEURES_SUP_IMPORT_CORRECTION", type = TypeOperation.CREATE, entite = Employee.class,
            perimetre = PerimetreCorrectionHeuresSupp.class)
    public HeuresSuppImportAnalyseDto corriger(MultipartFile fichier, YearMonth periode, Long chantierId,
                                               HeuresSuppImportCorrectionsDto corrections, HeuresSuppImportForfaitsDto forfaits) {
        verifierPrerequisOuEchec(periode, chantierId);
        FichierHeuresSupp classeur = lecteur.lire(fichier);
        Set<Long> ecartsEmployes = new HashSet<>();
        Map<Long, EmployeeResponseDto> employesAvecEcart = new HashMap<>();
        Map<Long, LigneFichierHeuresSupp> lignesAvecEcart = new HashMap<>();
        Map<Integer, LigneFichierHeuresSupp> inconnus = new LinkedHashMap<>();
        for (LigneFichierHeuresSupp ligne : classeur.lignes()) {
            EmployeeResponseDto employee = employes.findByCin(ligne.cin()).orElse(null);
            if (employee == null) {
                inconnus.put(ligne.numeroLigne(), ligne);
            } else if (ecart(employee.nomPrenom(), ligne.nomPrenom())) {
                ecartsEmployes.add(employee.id());
                employesAvecEcart.put(employee.id(), employee);
                lignesAvecEcart.put(employee.id(), ligne);
            }
        }
        Set<Long> employesAlignes = new HashSet<>();
        for (HeuresSuppImportCorrectionsDto.Alignement alignement : corrections.aligner()) {
            if (!ecartsEmployes.contains(alignement.employeId())) {
                throw new HeuresSuppImportException("L'employé " + alignement.employeId() + " n'a pas d'écart à aligner dans le fichier.");
            }
            if (!employesAlignes.add(alignement.employeId())) {
                throw new HeuresSuppImportException("Un employé ne peut être aligné qu'une fois par correction.");
            }
            EmployeeResponseDto employee = employesAvecEcart.get(alignement.employeId());
            LigneFichierHeuresSupp ligne = lignesAvecEcart.get(alignement.employeId());
            employes.update(employee.id(), new EmployeeUpdateRequestDto(employee.version(), ligne.nomPrenom(), employee.cin(),
                    employee.dateNaissance(), employee.dateEmbauche(), employee.fonction() == null ? null : employee.fonction().id(),
                    employee.chantier() == null ? null : employee.chantier().id(),
                    employee.equipe() == null ? null : employee.equipe().id(), employee.salaire(), employee.typeSalaire(), employee.statut()));
        }
        Set<Integer> creationsTraitees = new HashSet<>();
        for (HeuresSuppImportCorrectionsDto.Creation creation : corrections.creer()) {
            LigneFichierHeuresSupp ligne = inconnus.get(creation.numeroLigne());
            if (ligne == null) {
                throw new HeuresSuppImportException("La ligne " + creation.numeroLigne() + " n'est pas un CIN inconnu du fichier. Réanalysez le classeur avant de corriger.");
            }
            if (!creationsTraitees.add(creation.numeroLigne())) {
                throw new HeuresSuppImportException("La ligne " + creation.numeroLigne() + " est proposée plusieurs fois.");
            }
            if (!fonctions.existsById(creation.fonctionId())) {
                throw new HeuresSuppImportException("La fonction sélectionnée pour la ligne " + creation.numeroLigne() + " n'existe plus.");
            }
            employes.create(new EmployeeCreateRequestDto(ligne.nomPrenom(), ligne.cin(), creation.dateNaissance(),
                    creation.dateEmbauche(), creation.fonctionId(), chantierId, null,
                    creation.salaire(), creation.typeSalaire()));
        }
        entityManager.flush();
        return analyser(classeur, periode, chantierId, normaliserForfaits(forfaits), false);
    }

    @Transactional
    @AuditableAction(action = "HEURES_SUP_IMPORT", type = TypeOperation.CREATE, entite = HeureSupp.class,
            perimetre = PerimetreImportHeuresSupp.class)
    public HeuresSuppImportResultDto importer(MultipartFile fichier, YearMonth periode, Long chantierId,
                                              HeuresSuppImportForfaitsDto forfaits) {
        return enregistrer(fichier, periode, chantierId, forfaits, false);
    }

    @Transactional
    @AuditableAction(action = "HEURES_SUP_REMPLACEMENT", type = TypeOperation.UPDATE, entite = HeureSupp.class,
            perimetre = PerimetreImportHeuresSupp.class)
    public HeuresSuppImportResultDto remplacer(MultipartFile fichier, YearMonth periode, Long chantierId,
                                               HeuresSuppImportForfaitsDto forfaits) {
        return enregistrer(fichier, periode, chantierId, forfaits, true);
    }

    @Transactional(readOnly = true)
    public ByteArrayInputStream genererModele() {
        return lecteur.genererModele();
    }

    private HeuresSuppImportResultDto enregistrer(MultipartFile fichier, YearMonth periode, Long chantierId,
                                                   HeuresSuppImportForfaitsDto forfaits, boolean remplacement) {
        verifierPrerequisOuEchec(periode, chantierId);
        FichierHeuresSupp classeur = lecteur.lire(fichier);
        List<LigneFichierHeuresSupp> lignes = classeur.lignes();
        Map<String, BigDecimal> forfaitsParCin = normaliserForfaits(forfaits);
        HeuresSuppImportAnalyseDto analyse = analyser(classeur, periode, chantierId, forfaitsParCin, remplacement);
        if (!analyse.pret()) {
            throw new HeuresSuppImportException("L'import est bloqué : " + String.join(" ", analyse.erreurs())
                    + " Corrigez les lignes puis relancez l'analyse.");
        }

        Map<String, DossierLigne> personnes = constituerDossiers(lignes, periode, chantierId, forfaitsParCin, remplacement);
        List<HeureSupp> enregistrements = new ArrayList<>();
        int remplacements = 0;
        int forfaitsSeuls = 0;
        BigDecimal totalHeures = BigDecimal.ZERO;
        BigDecimal totalMontant = ZERO;
        BigDecimal totalStc = ZERO;
        BigDecimal totalForfait = ZERO;
        BigDecimal totalNet = ZERO;
        for (DossierLigne dossier : personnes.values()) {
            Long employeId = dossier.employe.id();
            if (repository.existsByEmployee_IdAndPeriodeAndChantier_Id(employeId, periode, chantierId)) {
                if (!remplacement) {
                    throw new HeuresSuppImportException("Une ligne existe déjà pour le CIN " + dossier.employe.cin()
                            + " sur ce mois et ce chantier. Utilisez l'action explicite de remplacement après vérification.");
                }
                repository.deleteByEmployee_IdAndPeriodeAndChantier_Id(employeId, periode, chantierId);
                remplacements++;
            }
            HeureSupp heure = creer(dossier, periode, chantierId);
            enregistrements.add(heure);
            if (dossier.heures == null) {
                forfaitsSeuls++;
            } else {
                totalHeures = totalHeures.add(dossier.heures);
            }
            totalMontant = totalMontant.add(heure.getMontant());
            totalStc = totalStc.add(heure.getStcDh());
            totalForfait = totalForfait.add(heure.getForfait() == null ? ZERO : heure.getForfait());
            totalNet = totalNet.add(heure.getNetAPayer());
        }
        repository.saveAll(enregistrements);
        repository.flush();
        return new HeuresSuppImportResultDto(periode, chantierId, lignes.size(), classeur.lignesZero(), forfaitsSeuls, remplacements,
                totalHeures, totalMontant, totalStc, totalForfait, totalNet);
    }

    private HeuresSuppImportAnalyseDto analyser(FichierHeuresSupp classeur, YearMonth periode, Long chantierId,
                                                 Map<String, BigDecimal> forfaits, boolean remplacement) {
        return analyser(classeur.lignes(), periode, chantierId, forfaits, remplacement,
                classeur.lignesZero(), classeur.totalLignes());
    }

    private HeuresSuppImportAnalyseDto analyser(List<LigneFichierHeuresSupp> lignes, YearMonth periode, Long chantierId,
                                                 Map<String, BigDecimal> forfaits, boolean remplacement) {
        return analyser(lignes, periode, chantierId, forfaits, remplacement, 0, lignes.size());
    }

    private HeuresSuppImportAnalyseDto analyser(List<LigneFichierHeuresSupp> lignes, YearMonth periode, Long chantierId,
                                                 Map<String, BigDecimal> forfaits, boolean remplacement,
                                                 int lignesZero, int totalLignes) {
        verifierPrerequisOuEchec(periode, chantierId);
        Map<String, DossierLigne> dossiers = constituerDossiers(lignes, periode, chantierId, forfaits, remplacement);
        List<String> erreurs = new ArrayList<>();
        List<HeuresSuppImportAnalyseDto.Ligne> resultats = new ArrayList<>();
        for (DossierLigne dossier : dossiers.values()) {
            List<String> erreursLigne = dossier.erreurs;
            erreurs.addAll(erreursLigne.stream().map(e -> "CIN " + dossier.cin + " : " + e).toList());
            BigDecimal montant = dossier.heures == null || dossier.salaireHoraire == null
                    ? ZERO : CalculHeuresSupp.montant(dossier.salaireHoraire, dossier.heures);
            BigDecimal stc = dossier.stcOuSortie ? montant : ZERO;
            BigDecimal forfait = dossier.forfait;
            BigDecimal net = montant.subtract(stc).add(forfait == null ? ZERO : forfait);
            resultats.add(new HeuresSuppImportAnalyseDto.Ligne(dossier.numeroLigne, dossier.cin,
                    dossier.employe == null ? null : dossier.employe.nomPrenom(),
                    dossier.employe == null || dossier.employe.fonction() == null ? null : dossier.employe.fonction().libelle(),
                    dossier.employe == null ? null : dossier.employe.id(),
                    dossier.source == null ? null : dossier.source.nomPrenom(),
                    null,
                    dossier.source != null && dossier.employe != null && ecart(dossier.employe.nomPrenom(), dossier.source.nomPrenom()),
                    false,
                    dossier.heures == null, dossier.heures, dossier.salaireHoraire, montant, dossier.stcOuSortie,
                    stc, forfait, net, erreursLigne));
        }
        return new HeuresSuppImportAnalyseDto(periode, chantierId, totalLignes, lignesZero, resultats, erreurs, erreurs.isEmpty());
    }

    private Map<String, DossierLigne> constituerDossiers(List<LigneFichierHeuresSupp> lignes, YearMonth periode,
                                                          Long chantierId, Map<String, BigDecimal> forfaits,
                                                          boolean remplacement) {
        verifierPrerequisOuEchec(periode, chantierId);
        Map<String, DossierLigne> dossiers = new LinkedHashMap<>();
        Set<String> forfaitsRattaches = new HashSet<>();
        for (LigneFichierHeuresSupp ligne : lignes) {
            String cle = cle(ligne.cin());
            DossierLigne dossier = new DossierLigne(ligne.numeroLigne(), ligne.cin(), ligne.heures(), ligne);
            dossiers.put(cle, dossier);
            chargerEmployeEtPaie(dossier, periode, chantierId, remplacement);
            if (forfaits.containsKey(cle)) {
                dossier.forfait = forfaits.get(cle);
                forfaitsRattaches.add(cle);
                verifierForfait(dossier);
            }
        }
        for (Map.Entry<String, BigDecimal> forfait : forfaits.entrySet()) {
            if (forfaitsRattaches.contains(forfait.getKey())) {
                continue;
            }
            String cin = forfait.getKey();
            DossierLigne dossier = new DossierLigne(0, cin, null, null);
            dossier.forfait = forfait.getValue();
            dossiers.putIfAbsent(cle(cin), dossier);
            dossier = dossiers.get(cle(cin));
            chargerEmployeEtPaie(dossier, periode, chantierId, remplacement);
            verifierForfait(dossier);
        }
        return dossiers;
    }

    private void chargerEmployeEtPaie(DossierLigne dossier, YearMonth periode, Long chantierId, boolean remplacement) {
        employes.findByCin(dossier.cin).ifPresentOrElse(employe -> {
            dossier.employe = employe;
            paie.findByEmployeeIdAndPeriode(employe.id(), periode).ifPresentOrElse(bulletin -> {
                dossier.paieId = bulletin.id();
                dossier.stcOuSortie = ObservationStc.estStcOuSortie(bulletin.observation());
            }, () -> dossier.erreurs.add("aucun bulletin de paie n'existe pour cet employé pendant le mois choisi."));
            if (dossier.heures != null) {
                try {
                    dossier.salaireHoraire = CalculHeuresSupp.salaireHoraire(employe.salaire(), employe.typeSalaire());
                } catch (IllegalArgumentException e) {
                    dossier.erreurs.add("salaire ou type de salaire manquant sur la fiche employé ; complétez la paie avant l'import.");
                }
            }
            if (dossier.source != null && ecart(employe.nomPrenom(), dossier.source.nomPrenom())) {
                dossier.erreurs.add("le nom du fichier diffère de la fiche ; confirmez l'alignement dans l'étape de correction.");
            }
            if (!remplacement && repository.existsByEmployee_IdAndPeriodeAndChantier_Id(employe.id(), periode, chantierId)) {
                dossier.erreurs.add("une ligne existe déjà pour ce mois et ce chantier ; confirmez son remplacement explicite.");
            }
            if (dossier.stcOuSortie
                    && repository.existsByEmployee_IdAndPeriodeAndForfaitIsNotNullAndChantier_IdNot(employe.id(), periode, chantierId)) {
                dossier.erreurs.add("un forfait existe déjà pour cet employé sur un autre chantier pendant le mois marqué STC/sortie.");
            }
        }, () -> dossier.erreurs.add("aucune fiche employé ne correspond à ce CIN ; créez la fiche avant de relancer l'analyse."));
    }

    private void verifierForfait(DossierLigne dossier) {
        if (dossier.employe == null || dossier.paieId == null) {
            return;
        }
        if (dossier.stcOuSortie) {
            dossier.erreurs.add("le forfait est interdit car la paie du même mois est marquée STC/sortie.");
        }
        if (dossier.forfait == null || dossier.forfait.signum() < 0 || dossier.forfait.scale() > 2) {
            dossier.erreurs.add("le forfait doit être un montant en DH positif ou nul avec deux décimales au maximum.");
        }
    }

    private HeureSupp creer(DossierLigne dossier, YearMonth periode, Long chantierId) {
        HeureSupp heure = new HeureSupp();
        heure.setEmployee(entityManager.getReference(Employee.class, dossier.employe.id()));
        heure.setPaie(entityManager.getReference(Paie.class, dossier.paieId));
        heure.setFonction(entityManager.getReference(Function.class, dossier.employe.fonction().id()));
        heure.setChantier(entityManager.getReference(Chantier.class, chantierId));
        heure.setPeriode(periode);
        heure.setHeures(dossier.heures);
        heure.setSalaireReference(dossier.heures == null ? null : dossier.employe.salaire());
        heure.setTypeSalaireReference(dossier.heures == null ? null : dossier.employe.typeSalaire());
        heure.setSalaireHoraire(dossier.heures == null ? null : dossier.salaireHoraire);
        BigDecimal montant = dossier.heures == null ? ZERO : CalculHeuresSupp.montant(dossier.salaireHoraire, dossier.heures);
        BigDecimal stc = CalculHeuresSupp.stcDh(montant, dossier.stcOuSortie);
        heure.setMontant(montant);
        heure.setStcOuSortie(dossier.stcOuSortie);
        heure.setStcDh(stc);
        heure.setForfait(dossier.forfait);
        heure.setNetAPayer(CalculHeuresSupp.netAPayer(montant, stc, dossier.forfait));
        return heure;
    }

    private void verifierPrerequisOuEchec(YearMonth periode, Long chantierId) {
        HeuresSuppImportPrerequisDto prerequis = verifierPrerequis(periode, chantierId);
        if (!prerequis.pret()) {
            throw new HeuresSuppImportException(prerequis.message());
        }
    }

    private Map<String, BigDecimal> normaliserForfaits(HeuresSuppImportForfaitsDto dto) {
        Map<String, BigDecimal> forfaits = new HashMap<>();
        if (dto == null) {
            return forfaits;
        }
        for (HeuresSuppImportForfaitsDto.Forfait forfait : dto.forfaits()) {
            String cle = cle(forfait.cin());
            if (forfaits.putIfAbsent(cle, forfait.montantDh()) != null) {
                throw new HeuresSuppImportException("Un seul forfait par CIN peut être saisi dans ce lot : " + forfait.cin());
            }
        }
        return forfaits;
    }

    private Long fonctionId(String libelle, Map<String, Long> fonctionsParLibelle) {
        String cle = cle(libelle);
        Long existante = fonctionsParLibelle.get(cle);
        if (existante != null) return existante;
        var resultat = fonctions.search(new FunctionSearchCriteria(libelle.strip()), PageRequest.of(0, 100));
        Long id = resultat.getContent().stream()
                .filter(fonction -> cle(fonction.libelle()).equals(cle))
                .map(fonction -> fonction.id()).findFirst()
                .orElseGet(() -> fonctions.create(new FunctionCreateRequestDto(libelle.strip())).id());
        fonctionsParLibelle.put(cle, id);
        return id;
    }

    private static boolean ecart(String gauche, String droite) {
        return !nomNormalise(gauche).equals(nomNormalise(droite));
    }

    private static String nomNormalise(String valeur) {
        return valeur == null ? "" : valeur.strip().toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
    }

    private static String cle(String cin) {
        return cin == null ? "" : cin.strip().toUpperCase(Locale.ROOT);
    }

    private static final class DossierLigne {
        private final int numeroLigne;
        private final String cin;
        private final BigDecimal heures;
        private final LigneFichierHeuresSupp source;
        private final List<String> erreurs = new ArrayList<>();
        private EmployeeResponseDto employe;
        private Long paieId;
        private BigDecimal salaireHoraire;
        private BigDecimal forfait;
        private boolean stcOuSortie;

        private DossierLigne(int numeroLigne, String cin, BigDecimal heures, LigneFichierHeuresSupp source) {
            this.numeroLigne = numeroLigne;
            this.cin = cin;
            this.heures = heures;
            this.source = source;
        }
    }
}

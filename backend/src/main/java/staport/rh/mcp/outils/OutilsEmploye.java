package staport.rh.mcp.outils;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import org.springframework.ai.mcp.annotation.McpTool;
import org.springframework.ai.mcp.annotation.McpToolParam;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.validation.annotation.Validated;
import staport.rh.audit.annotations.AuditableAction;
import staport.rh.audit.entities.CategorieAudit;
import staport.rh.employee.dtos.request.EmployeeSearchCriteria;
import staport.rh.employee.dtos.response.EmployeeAnalytiqueDto;
import staport.rh.employee.dtos.response.EmployeeRegroupementDto;
import staport.rh.employee.dtos.response.EmployeeResponseDto;
import staport.rh.employee.dtos.response.EmployeeSortieDto;
import staport.rh.employee.entities.DimensionEmployes;
import staport.rh.employee.entities.EmployeeStatut;
import staport.rh.employee.projection.ProjectionPaieEmployee;
import staport.rh.employee.services.interfaces.IEmployeeAnalytiqueService;
import staport.rh.employee.services.interfaces.IEmployeeService;
import staport.rh.mcp.dtos.VueProposeeDto;
import staport.rh.paie.parcours.ParcoursEmployeDto;
import staport.rh.paie.services.interfaces.IPaieParcoursService;

import java.time.YearMonth;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;

/**
 * Outils Employé : recherche, fiche, comptage, regroupement, départs et parcours. Mêmes champs que l'écran (CIN et
 * dates compris, décision du 2026-10-25) ; le salaire et son type seulement avec {@code PAIE_READ}, selon la règle de
 * l'API ({@link ProjectionPaieEmployee}). Mécanique portée par les frameworks, comme {@link OutilsReferentiels}.
 */
@Component
@Validated
@ConditionalOnBooleanProperty("security.mcp.enabled")
public class OutilsEmploye {

    private static final int LIMITE_FICHES = 20;
    private static final int NOMS_RENDUS = 20;
    private static final int GROUPES = 50;
    private static final int MOIS_DE_PARCOURS = 36;

    private final IEmployeeService employes;
    private final IEmployeeAnalytiqueService analytique;
    private final IPaieParcoursService parcours;
    private final PeriodePaie periodes;

    OutilsEmploye(IEmployeeService employes, IEmployeeAnalytiqueService analytique, IPaieParcoursService parcours,
                  PeriodePaie periodes) {
        this.employes = employes;
        this.analytique = analytique;
        this.parcours = parcours;
        this.periodes = periodes;
    }

    /** Regroupement des effectifs. */
    public enum Dimension { CHANTIER, EQUIPE, FONCTION }

    /** Critère de tri d'une recherche d'employés ; SALAIRE n'est permis qu'avec le droit de voir la paie. */
    public enum TriEmploye {
        NOM("nomPrenom"), CIN("cin"), DATE_EMBAUCHE("dateEmbauche"), DATE_NAISSANCE("dateNaissance"), SALAIRE("salaire");

        private final String propriete;

        TriEmploye(String propriete) {
            this.propriete = propriete;
        }
    }

    /** Critère de tri des groupes d'effectif. */
    public enum TriGroupeEmploye { EFFECTIF, EN_POSTE, LIBELLE, CODE }

    @McpTool(name = "employes_rechercher", title = "Rechercher des employés", generateOutputSchema = true,
            description = """
                    Trouve des employés par nom (partiel), CIN (partiel) et/ou par chantier, équipe, fonction ou statut ; au moins \
                    un critère est obligatoire. Rend, pour chaque employé : id, nom et prénom, CIN, dates de naissance et \
                    d'embauche, statut (EN_POSTE ou SORTI), fonction, chantier et équipe actuels, et le salaire seulement si \
                    l'utilisateur a le droit de voir la paie (`salaireVisible`). 20 fiches au plus par page, avec le nombre \
                    total. Triable (`tri` : NOM par défaut, CIN, DATE_EMBAUCHE, DATE_NAISSANCE, SALAIRE si la paie est \
                    visible ; `sens` ASC ou DESC) et paginable (`page`) : « les cinq derniers embauchés » se demande avec \
                    tri DATE_EMBAUCHE, sens DESC, limite 5. Pour seulement compter ou répartir des employés, préférer \
                    `employes_compter` ou `employes_regrouper`.""",
            annotations = @McpTool.McpAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true,
                    openWorldHint = false))
    @PreAuthorize("hasAuthority('EMPLOYEE_READ')")
    @AuditableAction(action = "MCP_EMPLOYES_RECHERCHER", categorie = CategorieAudit.ACCES, perimetre = PerimetreLectureMcp.class)
    public Map<String, Object> employesRechercher(
            @McpToolParam(required = false, description = "Nom et/ou prénom, partiel (2 caractères au moins).")
            @Size(min = 2, max = 150) String nom,
            @McpToolParam(required = false, description = "CIN (carte d'identité nationale), partiel (2 caractères au moins).")
            @Size(min = 2, max = 30) String cin,
            @McpToolParam(required = false, description = Formats.CHANTIERS_DOC) @Size(max = 50) List<@Min(0) Long> chantierIds,
            @McpToolParam(required = false, description = Formats.EQUIPES_DOC) @Size(max = 50) List<@Min(0) Long> equipeIds,
            @McpToolParam(required = false, description = Formats.FONCTIONS_DOC) @Size(max = 50) List<@Min(0) Long> fonctionIds,
            @McpToolParam(required = false, description = Formats.STATUT_EMPLOYE_DOC) StatutEmploye statut,
            @McpToolParam(required = false, description = "Nombre de fiches rendues par page, de 1 à 20, 10 par défaut.")
            @Min(1) @Max(LIMITE_FICHES) Integer limite,
            @McpToolParam(required = false, description = "Critère de tri : NOM (défaut), CIN, DATE_EMBAUCHE, "
                    + "DATE_NAISSANCE ou SALAIRE (réservé aux utilisateurs qui voient la paie).") TriEmploye tri,
            @McpToolParam(required = false, description = SensTri.DOC) SensTri sens,
            @McpToolParam(required = false, description = SensTri.PAGE_DOC) @Min(0) @Max(1000) Integer page) {
        String nomRecherche = texte(nom);
        String cinRecherche = texte(cin);
        List<Long> chantiers = ids(chantierIds);
        List<Long> equipes = ids(equipeIds);
        List<Long> fonctions = ids(fonctionIds);
        EmployeeStatut statutApi = StatutEmploye.versApi(statut);
        if (nomRecherche == null && cinRecherche == null && chantiers == null && equipes == null && fonctions == null
                && statutApi == null) {
            throw new IllegalArgumentException("Préciser un nom, un CIN ou un périmètre (chantier, équipe, fonction, statut).");
        }
        boolean voitLaPaie = ProjectionPaieEmployee.voitLaPaie(SecurityContextHolder.getContext().getAuthentication());
        if (tri == TriEmploye.SALAIRE && !voitLaPaie) {
            throw new IllegalArgumentException("Le tri par salaire est réservé aux utilisateurs qui voient la paie.");
        }
        TriEmploye critere = tri == null ? TriEmploye.NOM : tri;
        SensTri ordre = SensTri.ou(sens, critere == TriEmploye.NOM || critere == TriEmploye.CIN ? SensTri.ASC : SensTri.DESC);
        Page<EmployeeResponseDto> resultats = employes.search(
                new EmployeeSearchCriteria(nomRecherche, cinRecherche, fonctions, chantiers, equipes, statutApi),
                PageRequest.of(page == null ? 0 : page, limite == null ? 10 : limite,
                        ordre.sur(critere.propriete, "nomPrenom")));
        List<Map<String, Object>> fiches = resultats.getContent().stream()
                .map(employe -> fiche(ProjectionPaieEmployee.pourLeLecteur(employe, voitLaPaie), voitLaPaie))
                .toList();
        Map<String, String> parametres = new LinkedHashMap<>(Perimetres.parametresUrl(chantiers, equipes, fonctions));
        if (nomRecherche != null) {
            parametres.put("nom", nomRecherche);
        }
        if (cinRecherche != null) {
            parametres.put("cin", cinRecherche);
        }
        StatutEmploye.versUrl(statutApi, parametres);
        Map<String, Object> donnees = new LinkedHashMap<>();
        donnees.put("total", resultats.getTotalElements());
        donnees.put("rendus", fiches.size());
        donnees.put("page", resultats.getNumber());
        donnees.put("employes", fiches);
        donnees.put("salaireVisible", voitLaPaie);
        donnees.put("vue", new VueProposeeDto("employees", "tabulaire", parametres).enJson());
        return donnees;
    }

    @McpTool(name = "employe_fiche", title = "Fiche d'un employé", generateOutputSchema = true,
            description = """
                    Lit la fiche complète d'un employé à partir de son identifiant : CIN, dates de naissance et d'embauche, \
                    fonction, chantier, équipe, statut, et la liste de ses départs enregistrés (période et motif) ; le salaire \
                    seulement avec le droit de voir la paie. Identifiant inconnu : le chercher d'abord avec \
                    `employes_rechercher`. Pour l'historique mois par mois, utiliser `employe_parcours`.""",
            annotations = @McpTool.McpAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true,
                    openWorldHint = false))
    @PreAuthorize("hasAuthority('EMPLOYEE_READ')")
    @AuditableAction(action = "MCP_EMPLOYE_FICHE", categorie = CategorieAudit.ACCES, perimetre = PerimetreLectureMcp.class)
    public Map<String, Object> employeFiche(
            @McpToolParam(description = "Identifiant de l'employé (entier positif), rendu par `employes_rechercher`.")
            @Positive Long id) {
        boolean voitLaPaie = ProjectionPaieEmployee.voitLaPaie(SecurityContextHolder.getContext().getAuthentication());
        EmployeeResponseDto employe = ProjectionPaieEmployee.pourLeLecteur(employes.findById(id), voitLaPaie);
        List<Map<String, Object>> departs = employes.listerSorties(id).stream()
                .map(s -> Map.<String, Object>of("periode", s.periode().toString(),
                        "motif", s.motif() == null ? "NON_PRECISE" : s.motif()))
                .toList();
        Map<String, Object> donnees = new LinkedHashMap<>();
        donnees.put("employe", fiche(employe, voitLaPaie));
        donnees.put("departs", departs);
        donnees.put("vue", new VueProposeeDto("employees", "fiche", Map.of("id", String.valueOf(id))).enJson());
        return donnees;
    }

    @McpTool(name = "employes_compter", title = "Effectif et statistiques des employés", generateOutputSchema = true,
            description = """
                    Compte les employés d'un périmètre (chantiers, équipes, fonctions, statut) : effectif total, en poste, \
                    sortis, âge moyen et ancienneté moyenne en années, embauches des 12 derniers mois et répartition par \
                    tranches d'âge et d'ancienneté. Mêmes chiffres que la vue Analytique des employés ; aucun salaire. État \
                    courant des fiches (issu du dernier mois de paie importé), pas un historique : pour l'évolution d'un mois à \
                    l'autre, utiliser `paie_mouvements`. Pour les chiffres d'un seul groupe, filtrer par identifiants.""",
            annotations = @McpTool.McpAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true,
                    openWorldHint = false))
    @PreAuthorize("hasAuthority('EMPLOYEE_READ')")
    @AuditableAction(action = "MCP_EMPLOYES_COMPTER", categorie = CategorieAudit.ACCES, perimetre = PerimetreLectureMcp.class)
    public Map<String, Object> employesCompter(
            @McpToolParam(required = false, description = Formats.CHANTIERS_DOC) @Size(max = 50) List<@Min(0) Long> chantierIds,
            @McpToolParam(required = false, description = Formats.EQUIPES_DOC) @Size(max = 50) List<@Min(0) Long> equipeIds,
            @McpToolParam(required = false, description = Formats.FONCTIONS_DOC) @Size(max = 50) List<@Min(0) Long> fonctionIds,
            @McpToolParam(required = false, description = Formats.STATUT_EMPLOYE_DOC) StatutEmploye statut) {
        List<Long> chantiers = ids(chantierIds);
        List<Long> equipes = ids(equipeIds);
        List<Long> fonctions = ids(fonctionIds);
        EmployeeStatut statutApi = StatutEmploye.versApi(statut);
        EmployeeAnalytiqueDto resultat = analytique.analyser(
                new EmployeeSearchCriteria(null, null, fonctions, chantiers, equipes, statutApi));
        Map<String, Object> donnees = new LinkedHashMap<>();
        donnees.put("effectif", resultat.effectif());
        donnees.put("enPoste", resultat.actifs());
        donnees.put("sortis", resultat.inactifs());
        donnees.put("ageMoyen", resultat.ageMoyen());
        donnees.put("ancienneteMoyenne", resultat.ancienneteMoyenne());
        donnees.put("embauchesDouzeMois", resultat.embauchesDouzeMois());
        donnees.put("parAge", tranches(resultat.parAge()));
        donnees.put("parAnciennete", tranches(resultat.parAnciennete()));
        Map<String, String> parametres = new LinkedHashMap<>(Perimetres.parametresUrl(chantiers, equipes, fonctions));
        StatutEmploye.versUrl(statutApi, parametres);
        donnees.put("vue", new VueProposeeDto("employees", "analytique", parametres).enJson());
        return donnees;
    }

    @McpTool(name = "employes_regrouper", title = "Effectif par chantier, équipe ou fonction", generateOutputSchema = true,
            description = """
                    Répartit l'effectif des employés par chantier, par équipe ou par fonction (total et en poste) sur un \
                    périmètre. Du plus grand groupe au plus petit par défaut ; `tri` (EFFECTIF, EN_POSTE, LIBELLE, CODE) et \
                    `sens` (ASC ou DESC) donnent « les équipes les plus petites » ou l'ordre alphabétique. À utiliser pour « quels \
                    chantiers ont le plus d'employés », « combien par équipe ». Chaque groupe rend id, code, libellé, effectif \
                    et nombre en poste ; 50 groupes au plus. Les montants de paie par groupe sont dans `paie_repartition`.""",
            annotations = @McpTool.McpAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true,
                    openWorldHint = false))
    @PreAuthorize("hasAuthority('EMPLOYEE_READ')")
    @AuditableAction(action = "MCP_EMPLOYES_REGROUPER", categorie = CategorieAudit.ACCES, perimetre = PerimetreLectureMcp.class)
    public Map<String, Object> employesRegrouper(
            @McpToolParam(description = "Regroupement : CHANTIER, EQUIPE ou FONCTION.") Dimension dimension,
            @McpToolParam(required = false, description = Formats.CHANTIERS_DOC) @Size(max = 50) List<@Min(0) Long> chantierIds,
            @McpToolParam(required = false, description = Formats.EQUIPES_DOC) @Size(max = 50) List<@Min(0) Long> equipeIds,
            @McpToolParam(required = false, description = Formats.FONCTIONS_DOC) @Size(max = 50) List<@Min(0) Long> fonctionIds,
            @McpToolParam(required = false, description = Formats.STATUT_EMPLOYE_DOC) StatutEmploye statut,
            @McpToolParam(required = false, description = "Nombre de groupes rendus, de 1 à 50, 50 par défaut.")
            @Min(1) @Max(GROUPES) Integer limite,
            @McpToolParam(required = false, description = "Critère de tri des groupes : EFFECTIF (défaut), EN_POSTE, "
                    + "LIBELLE ou CODE.") TriGroupeEmploye tri,
            @McpToolParam(required = false, description = SensTri.DOC) SensTri sens) {
        List<Long> chantiers = ids(chantierIds);
        List<Long> equipes = ids(equipeIds);
        List<Long> fonctions = ids(fonctionIds);
        EmployeeStatut statutApi = StatutEmploye.versApi(statut);
        List<EmployeeRegroupementDto> groupes = analytique.regrouper(
                new EmployeeSearchCriteria(null, null, fonctions, chantiers, equipes, statutApi),
                DimensionEmployes.valueOf(dimension.name()));
        TriGroupeEmploye critere = tri == null ? TriGroupeEmploye.EFFECTIF : tri;
        SensTri ordre = SensTri.ou(sens, critere == TriGroupeEmploye.EFFECTIF || critere == TriGroupeEmploye.EN_POSTE
                ? SensTri.DESC : SensTri.ASC);
        Comparator<EmployeeRegroupementDto> comparateur = switch (critere) {
            case EFFECTIF -> Comparator.comparingLong(EmployeeRegroupementDto::effectif);
            case EN_POSTE -> Comparator.comparingLong(EmployeeRegroupementDto::actifs);
            case LIBELLE -> Comparator.comparing(g -> String.valueOf(g.libelle()), String.CASE_INSENSITIVE_ORDER);
            case CODE -> Comparator.comparing(g -> String.valueOf(g.code()), String.CASE_INSENSITIVE_ORDER);
        };
        List<EmployeeRegroupementDto> ordonnes = groupes.stream()
                .sorted(ordre == SensTri.ASC ? comparateur : comparateur.reversed()).toList();
        List<Map<String, Object>> rendus = ordonnes.stream().limit(limite == null ? GROUPES : limite).map(g -> {
            Map<String, Object> groupe = new LinkedHashMap<>();
            groupe.put("id", g.id());
            groupe.put("code", g.code());
            groupe.put("libelle", g.libelle());
            groupe.put("effectif", g.effectif());
            groupe.put("enPoste", g.actifs());
            return groupe;
        }).toList();
        Map<String, String> parametres = new LinkedHashMap<>(Perimetres.parametresUrl(chantiers, equipes, fonctions));
        StatutEmploye.versUrl(statutApi, parametres);
        Map<String, Object> donnees = new LinkedHashMap<>();
        donnees.put("dimension", dimension.name());
        donnees.put("nombreGroupes", groupes.size());
        donnees.put("groupes", rendus);
        donnees.put("vue", new VueProposeeDto("employees", "cartes", parametres).enJson());
        return donnees;
    }

    @McpTool(name = "employes_sorties", title = "Départs d'un mois", generateOutputSchema = true,
            description = """
                    Liste les départs de l'entreprise constatés par la paie d'un mois (soldes de tout compte et absences \
                    confirmées) : nombre total, nombre par motif et, pour les 20 premiers, l'employé concerné. Un départ \
                    ancien sans motif est compté « NON_PRECISE ». À ne pas confondre avec les « plus payés » de \
                    `paie_mouvements`, qui comptent aussi les absences non confirmées.""",
            annotations = @McpTool.McpAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true,
                    openWorldHint = false))
    @PreAuthorize("hasAuthority('EMPLOYEE_READ')")
    @AuditableAction(action = "MCP_EMPLOYES_SORTIES", categorie = CategorieAudit.ACCES, perimetre = PerimetreLectureMcp.class)
    public Map<String, Object> employesSorties(
            @McpToolParam(required = false, description = Formats.PERIODE_DOC) @Pattern(regexp = Formats.PERIODE) String periode) {
        YearMonth mois = periodes.ou(periode);
        List<EmployeeSortieDto> sorties = employes.listerToutesLesSorties().stream()
                .filter(sortie -> mois.equals(sortie.periode()))
                .toList();
        Map<String, Long> parMotif = sorties.stream()
                .collect(Collectors.groupingBy(OutilsEmploye::motif, TreeMap::new, Collectors.counting()));
        List<Map<String, Object>> personnes = sorties.stream().limit(NOMS_RENDUS)
                .map(sortie -> Map.<String, Object>of("id", sortie.employeId(),
                        "nomPrenom", employes.findById(sortie.employeId()).nomPrenom(), "motif", motif(sortie)))
                .toList();
        Map<String, Object> donnees = new LinkedHashMap<>();
        donnees.put("periode", mois.toString());
        donnees.put("nombre", sorties.size());
        donnees.put("parMotif", parMotif);
        donnees.put("employes", personnes);
        donnees.put("vue", vue(mois).enJson());
        return donnees;
    }

    @McpTool(name = "employe_parcours", title = "Parcours d'un employé", generateOutputSchema = true,
            description = """
                    Reconstitue le parcours d'un employé depuis ses bulletins de paie : indicateurs (mois payés, total perçu en \
                    dirhams, jours travaillés, premier et dernier mois), ses 36 derniers mois (chantier, équipe, fonction, \
                    jours, salaires, observation) et ses événements (entrée, mutation, changement de salaire, départ, retour). \
                    Réservé aux utilisateurs qui voient la paie. Identifiant inconnu : le chercher d'abord avec \
                    `employes_rechercher`.""",
            annotations = @McpTool.McpAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true,
                    openWorldHint = false))
    @PreAuthorize("hasAuthority('PAIE_READ')")
    @AuditableAction(action = "MCP_EMPLOYE_PARCOURS", categorie = CategorieAudit.ACCES, perimetre = PerimetreLectureMcp.class)
    public Map<String, Object> employeParcours(
            @McpToolParam(description = "Identifiant de l'employé (entier positif), rendu par `employes_rechercher`.")
            @Positive Long id) {
        ParcoursEmployeDto resultat = parcours.parcours(id);
        List<ParcoursEmployeDto.MoisDto> mois = resultat.mois();
        Map<String, Object> donnees = new LinkedHashMap<>();
        donnees.put("indicateurs", indicateurs(resultat.indicateurs()));
        donnees.put("mois", mois.subList(Math.max(0, mois.size() - MOIS_DE_PARCOURS), mois.size())
                .stream().map(OutilsEmploye::mois).toList());
        donnees.put("evenements", resultat.evenements().stream().map(OutilsEmploye::evenement).toList());
        donnees.put("vue", new VueProposeeDto("employees", "fiche", Map.of("id", String.valueOf(id))).enJson());
        return donnees;
    }

    /**
     * Les mouvements du mois (Employés › Analytique, avec {@code PAIE_READ}) ; sans ce droit, la liste des employés sortis
     * (décision du 2026-10-25 : aucun nouvel écran).
     */
    private static VueProposeeDto vue(YearMonth periode) {
        if (ProjectionPaieEmployee.voitLaPaie(SecurityContextHolder.getContext().getAuthentication())) {
            return new VueProposeeDto("employees", "analytique", Map.of("periode", periode.toString()));
        }
        Map<String, String> parametres = new LinkedHashMap<>();
        StatutEmploye.versUrl(EmployeeStatut.INACTIF, parametres);
        return new VueProposeeDto("employees", "tabulaire", parametres);
    }

    /** Un départ ancien sans motif reste compté. */
    private static String motif(EmployeeSortieDto sortie) {
        return sortie.motif() == null || sortie.motif().isBlank() ? "NON_PRECISE" : sortie.motif();
    }

    /** Une fiche Employé pour l'assistant. */
    static Map<String, Object> fiche(EmployeeResponseDto employe, boolean voitLaPaie) {
        Map<String, Object> fiche = new LinkedHashMap<>();
        fiche.put("id", employe.id());
        fiche.put("nomPrenom", employe.nomPrenom());
        fiche.put("cin", employe.cin());
        fiche.put("dateNaissance", employe.dateNaissance() == null ? null : employe.dateNaissance().toString());
        fiche.put("dateEmbauche", employe.dateEmbauche() == null ? null : employe.dateEmbauche().toString());
        fiche.put("statut", StatutEmploye.libelle(employe.statut()));
        fiche.put("fonction", employe.fonction() == null ? null
                : Map.of("id", employe.fonction().id(), "libelle", employe.fonction().libelle()));
        fiche.put("chantier", employe.chantier() == null ? null
                : Map.of("id", employe.chantier().id(), "code", employe.chantier().code()));
        fiche.put("equipe", employe.equipe() == null ? null
                : Map.of("id", employe.equipe().id(), "code", employe.equipe().code()));
        if (voitLaPaie) {
            fiche.put("salaire", employe.salaire());
            fiche.put("typeSalaire", employe.typeSalaire() == null ? null : employe.typeSalaire().name());
        }
        return fiche;
    }

    private static List<Map<String, Object>> tranches(List<EmployeeAnalytiqueDto.TrancheDto> tranches) {
        return tranches.stream().map(t -> {
            Map<String, Object> tranche = new LinkedHashMap<>();
            tranche.put("min", t.min());
            tranche.put("max", t.max());
            tranche.put("effectif", t.effectif());
            return tranche;
        }).toList();
    }

    private static Map<String, Object> indicateurs(ParcoursEmployeDto.Indicateurs i) {
        Map<String, Object> valeurs = new LinkedHashMap<>();
        valeurs.put("moisPayes", i.moisPayes());
        valeurs.put("totalPercu", i.totalPercu());
        valeurs.put("joursTravailles", i.joursTravailles());
        valeurs.put("premierMois", i.premierMois() == null ? null : i.premierMois().toString());
        valeurs.put("dernierMois", i.dernierMois() == null ? null : i.dernierMois().toString());
        return valeurs;
    }

    private static Map<String, Object> mois(ParcoursEmployeDto.MoisDto m) {
        Map<String, Object> valeurs = new LinkedHashMap<>();
        valeurs.put("bulletinId", m.bulletinId());
        valeurs.put("periode", m.periode().toString());
        valeurs.put("fonction", m.fonction());
        valeurs.put("chantier", m.chantier());
        valeurs.put("equipe", m.equipe());
        valeurs.put("joursTravailles", m.nombreJoursTravailles());
        valeurs.put("salaireMensuel", m.salaireMensuel());
        valeurs.put("salaireTotal", m.salaireTotal());
        valeurs.put("observation", m.observation());
        return valeurs;
    }

    private static Map<String, Object> evenement(ParcoursEmployeDto.EvenementDto e) {
        Map<String, Object> valeurs = new LinkedHashMap<>();
        valeurs.put("periode", e.periode().toString());
        valeurs.put("type", e.type().name());
        valeurs.put("avant", e.avant());
        valeurs.put("apres", e.apres());
        valeurs.put("motif", e.motif());
        return valeurs;
    }

    private static String texte(String valeur) {
        return valeur == null || valeur.isBlank() ? null : valeur.trim();
    }

    /** Identifiants d'une dimension ; {@code null} quand l'argument est absent ou vide (pas de filtre). */
    static List<Long> ids(List<Long> valeurs) {
        return valeurs == null || valeurs.isEmpty() ? null : valeurs.stream().distinct().toList();
    }
}

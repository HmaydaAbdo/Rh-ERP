package staport.rh.mcp.outils;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.ai.mcp.annotation.McpTool;
import org.springframework.ai.mcp.annotation.McpToolParam;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Component;
import org.springframework.validation.annotation.Validated;
import staport.rh.audit.annotations.AuditableAction;
import staport.rh.audit.entities.CategorieAudit;
import staport.rh.mcp.dtos.VueProposeeDto;
import staport.rh.paie.dtos.request.PaieSearchCriteria;
import staport.rh.paie.dtos.response.PaieAnalytiqueDto;
import staport.rh.paie.dtos.response.PaieChantierPeriodeDto;
import staport.rh.paie.dtos.response.PaiePeriodeResumeDto;
import staport.rh.paie.dtos.response.PaieResponseDto;
import staport.rh.paie.effectifs.EffectifMoisDto;
import staport.rh.paie.effectifs.EffectifsCriteria;
import staport.rh.paie.services.interfaces.IPaieAnalytiqueService;
import staport.rh.paie.services.interfaces.IPaieEffectifsService;
import staport.rh.paie.services.interfaces.IPaieService;

import java.time.YearMonth;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static staport.rh.mcp.outils.OutilsEmploye.ids;

/**
 * Outils Paie : indicateurs, mois importés, répartition, évolution, mouvements d'effectif, qualité des données,
 * bulletins et préparation du rapport. Chiffres issus des façades de la Paie ; le modèle ne calcule rien. Mécanique
 * portée par les frameworks, comme {@link OutilsReferentiels}.
 */
@Component
@Validated
@ConditionalOnBooleanProperty("security.mcp.enabled")
public class OutilsPaie {

    private static final int CHANTIERS_RENDUS = 5;
    private static final int MOIS = 36;
    private static final int GROUPES = 50;
    private static final int BULLETINS = 20;

    /** Sens de chaque chiffre de {@code paie_mouvements}, rendu avec lui pour que la réponse le cite. */
    private static final Map<String, String> DEFINITIONS_MOUVEMENTS = Map.of(
            "effectif", "Employés payés dans le mois (un bulletin)",
            "effectifMoisPrecedent", "Employés payés le mois précédent ; absent si ce mois n'a pas de paie",
            "variation", "Effectif du mois moins effectif du mois précédent (écart net)",
            "entrees", "Employés payés ce mois-ci et absents de la paie du mois précédent",
            "plusPayes", "Employés payés le mois précédent et absents de la paie de ce mois",
            "sorties", "Départs enregistrés sur la fiche employé dans le mois, parmi les payés du mois ou du précédent",
            "mutations", "Employés payés les deux mois, sur un chantier différent");

    private final IPaieService paie;
    private final IPaieAnalytiqueService analytique;
    private final IPaieEffectifsService effectifs;
    private final PeriodePaie periodes;

    OutilsPaie(IPaieService paie, IPaieAnalytiqueService analytique, IPaieEffectifsService effectifs, PeriodePaie periodes) {
        this.paie = paie;
        this.analytique = analytique;
        this.effectifs = effectifs;
        this.periodes = periodes;
    }

    /** Regroupement de la paie. */
    public enum Dimension { CHANTIER, EQUIPE, FONCTION }

    @McpTool(name = "paie_indicateurs", title = "Indicateurs de paie d'un mois", generateOutputSchema = true,
            description = """
                    Chiffres clés de la paie d'un mois sur un périmètre (chantiers, équipes, fonctions) : masse salariale en \
                    dirhams, effectif payé (nombre de bulletins), coût moyen par employé, nombre de chantiers, soldes de tout \
                    compte (STC, départs payés) et leur montant. Rend aussi les mêmes chiffres pour le mois précédent et les 5 \
                    principaux chantiers par masse. C'est l'outil par défaut pour « combien coûte / combien d'employés payés ». \
                    Pour l'évolution sur plusieurs mois utiliser `paie_evolution` ; pour les arrivées et départs, \
                    `paie_mouvements` ; pour détailler par chantier, équipe ou fonction, `paie_repartition`.""",
            annotations = @McpTool.McpAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true,
                    openWorldHint = false))
    @PreAuthorize("hasAuthority('PAIE_READ')")
    @AuditableAction(action = "MCP_PAIE_INDICATEURS", categorie = CategorieAudit.ACCES, perimetre = PerimetreLectureMcp.class)
    public Map<String, Object> paieIndicateurs(
            @McpToolParam(required = false, description = Formats.PERIODE_DOC) @Pattern(regexp = Formats.PERIODE) String periode,
            @McpToolParam(required = false, description = Formats.CHANTIERS_DOC) @Size(max = 50) List<@Min(0) Long> chantierIds,
            @McpToolParam(required = false, description = Formats.EQUIPES_DOC) @Size(max = 50) List<@Min(0) Long> equipeIds,
            @McpToolParam(required = false, description = Formats.FONCTIONS_DOC) @Size(max = 50) List<@Min(0) Long> fonctionIds) {
        Filtre filtre = new Filtre(ids(chantierIds), ids(equipeIds), ids(fonctionIds));
        YearMonth mois = periodes.ou(periode);
        PaieAnalytiqueDto resultat = analytique.analyser(filtre.criteres(mois));
        List<Map<String, Object>> principaux = resultat.parChantier().stream().limit(CHANTIERS_RENDUS)
                .map(c -> {
                    Map<String, Object> chantier = new LinkedHashMap<>();
                    chantier.put("id", c.id());
                    chantier.put("code", c.code());
                    chantier.put("libelle", c.libelle());
                    chantier.put("masse", c.masse());
                    chantier.put("effectif", c.effectif());
                    return chantier;
                })
                .toList();
        Map<String, Object> donnees = new LinkedHashMap<>();
        donnees.put("periode", mois.toString());
        donnees.put("indicateurs", kpi(resultat.kpis()));
        donnees.put("moisPrecedent", resultat.moisPrecedent() == null ? null : kpi(resultat.moisPrecedent()));
        donnees.put("principauxChantiers", principaux);
        donnees.put("vue", new VueProposeeDto("paie", "analytique", filtre.parametres(mois)).enJson());
        return donnees;
    }

    @McpTool(name = "paie_periodes", title = "Mois de paie importés", generateOutputSchema = true,
            description = """
                    Liste les mois de paie importés, du plus récent au plus ancien, avec pour chacun le nombre de bulletins, le \
                    nombre de chantiers, la masse salariale en dirhams et les soldes de tout compte (STC), sur un périmètre. \
                    À utiliser pour savoir quels mois existent ou quel est le dernier mois de paie ; 36 mois au plus.""",
            annotations = @McpTool.McpAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true,
                    openWorldHint = false))
    @PreAuthorize("hasAuthority('PAIE_READ')")
    @AuditableAction(action = "MCP_PAIE_PERIODES", categorie = CategorieAudit.ACCES, perimetre = PerimetreLectureMcp.class)
    public Map<String, Object> paiePeriodes(
            @McpToolParam(required = false, description = Formats.CHANTIERS_DOC) @Size(max = 50) List<@Min(0) Long> chantierIds,
            @McpToolParam(required = false, description = Formats.EQUIPES_DOC) @Size(max = 50) List<@Min(0) Long> equipeIds,
            @McpToolParam(required = false, description = Formats.FONCTIONS_DOC) @Size(max = 50) List<@Min(0) Long> fonctionIds,
            @McpToolParam(required = false, description = "Nombre de mois rendus, de 1 à 36, 12 par défaut.")
            @Min(1) @Max(MOIS) Integer limite) {
        Filtre filtre = new Filtre(ids(chantierIds), ids(equipeIds), ids(fonctionIds));
        List<PaiePeriodeResumeDto> toutes = paie.findPeriodes(filtre.criteres(null));
        List<Map<String, Object>> rendues = toutes.stream().limit(limite == null ? 12 : limite)
                .map(OutilsPaie::periode).toList();
        Map<String, Object> donnees = new LinkedHashMap<>();
        donnees.put("nombreMois", toutes.size());
        donnees.put("periodes", rendues);
        donnees.put("vue", new VueProposeeDto("paie", "cartes", filtre.parametres(null)).enJson());
        return donnees;
    }

    @McpTool(name = "paie_repartition", title = "Paie par chantier, équipe ou fonction", generateOutputSchema = true,
            description = """
                    Répartit la paie d'un mois par chantier, par équipe ou par fonction : masse salariale en dirhams, effectif \
                    payé et soldes de tout compte (STC) de chaque groupe, de la plus grosse masse à la plus petite ; 50 groupes \
                    au plus. À utiliser pour « quel chantier coûte le plus », « masse par équipe ». Pour les effectifs sans \
                    montants, `employes_regrouper` ; pour un seul chiffre global, `paie_indicateurs`.""",
            annotations = @McpTool.McpAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true,
                    openWorldHint = false))
    @PreAuthorize("hasAuthority('PAIE_READ')")
    @AuditableAction(action = "MCP_PAIE_REPARTITION", categorie = CategorieAudit.ACCES, perimetre = PerimetreLectureMcp.class)
    public Map<String, Object> paieRepartition(
            @McpToolParam(description = "Regroupement : CHANTIER, EQUIPE ou FONCTION.") Dimension dimension,
            @McpToolParam(required = false, description = Formats.PERIODE_DOC) @Pattern(regexp = Formats.PERIODE) String periode,
            @McpToolParam(required = false, description = Formats.CHANTIERS_DOC) @Size(max = 50) List<@Min(0) Long> chantierIds,
            @McpToolParam(required = false, description = Formats.EQUIPES_DOC) @Size(max = 50) List<@Min(0) Long> equipeIds,
            @McpToolParam(required = false, description = Formats.FONCTIONS_DOC) @Size(max = 50) List<@Min(0) Long> fonctionIds,
            @McpToolParam(required = false, description = "Nombre de groupes rendus, de 1 à 50, 50 par défaut.")
            @Min(1) @Max(GROUPES) Integer limite) {
        Filtre filtre = new Filtre(ids(chantierIds), ids(equipeIds), ids(fonctionIds));
        YearMonth mois = periodes.ou(periode);
        PaieAnalytiqueDto resultat = analytique.analyser(filtre.criteres(mois));
        List<Map<String, Object>> groupes = switch (dimension) {
            case CHANTIER -> resultat.parChantier().stream()
                    .map(c -> groupe(c.id(), c.code(), c.libelle(), c.masse(), c.effectif(), c.stc(), c.stcMontant())).toList();
            case EQUIPE -> resultat.parEquipe().stream()
                    .map(e -> groupe(e.id(), e.code(), e.libelle(), e.masse(), e.effectif(), e.stc(), e.stcMontant())).toList();
            case FONCTION -> resultat.parFonction().stream()
                    .map(f -> groupe(f.id(), null, f.libelle(), f.masse(), f.effectif(), f.stc(), f.stcMontant())).toList();
        };
        List<Map<String, Object>> rendus = groupes.stream().limit(limite == null ? GROUPES : limite).toList();
        Map<String, Object> donnees = new LinkedHashMap<>();
        donnees.put("periode", mois.toString());
        donnees.put("dimension", dimension.name());
        donnees.put("nombreGroupes", groupes.size());
        donnees.put("groupes", rendus);
        donnees.put("vue", new VueProposeeDto("paie", "analytique", filtre.parametres(mois)).enJson());
        return donnees;
    }

    @McpTool(name = "paie_evolution", title = "Évolution mensuelle de la paie", generateOutputSchema = true,
            description = """
                    Série mensuelle de la paie d'un périmètre, du mois le plus ancien au plus récent, jusqu'au mois donné : masse \
                    salariale en dirhams, effectif payé, soldes de tout compte (STC) et leur montant. À utiliser pour les \
                    tendances (« la masse augmente-t-elle ? »). Pour comparer seulement deux mois, `paie_indicateurs` rend déjà \
                    le mois précédent ; 36 mois au plus.""",
            annotations = @McpTool.McpAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true,
                    openWorldHint = false))
    @PreAuthorize("hasAuthority('PAIE_READ')")
    @AuditableAction(action = "MCP_PAIE_EVOLUTION", categorie = CategorieAudit.ACCES, perimetre = PerimetreLectureMcp.class)
    public Map<String, Object> paieEvolution(
            @McpToolParam(required = false, description = "Dernier mois de la série, au format aaaa-MM. Absent = le dernier "
                    + "mois de paie importé.") @Pattern(regexp = Formats.PERIODE) String periode,
            @McpToolParam(required = false, description = Formats.CHANTIERS_DOC) @Size(max = 50) List<@Min(0) Long> chantierIds,
            @McpToolParam(required = false, description = Formats.EQUIPES_DOC) @Size(max = 50) List<@Min(0) Long> equipeIds,
            @McpToolParam(required = false, description = Formats.FONCTIONS_DOC) @Size(max = 50) List<@Min(0) Long> fonctionIds,
            @McpToolParam(required = false, description = "Nombre de mois rendus, de 1 à 36, 12 par défaut.")
            @Min(1) @Max(MOIS) Integer limite) {
        Filtre filtre = new Filtre(ids(chantierIds), ids(equipeIds), ids(fonctionIds));
        YearMonth derniere = periodes.ou(periode);
        // L'évolution couvre tout l'historique du périmètre : on la borne au mois demandé (aaaa-MM se compare en texte).
        List<PaieAnalytiqueDto.Evolution> evolution = analytique.analyser(filtre.criteres(derniere)).evolution().stream()
                .filter(e -> e.periode().compareTo(derniere.toString()) <= 0).toList();
        int nombre = limite == null ? 12 : limite;
        List<Map<String, Object>> mois = evolution.subList(Math.max(0, evolution.size() - nombre), evolution.size())
                .stream().map(e -> {
                    Map<String, Object> valeurs = new LinkedHashMap<>();
                    valeurs.put("periode", e.periode());
                    valeurs.put("masse", e.masse());
                    valeurs.put("effectif", e.effectif());
                    valeurs.put("stc", e.stc());
                    valeurs.put("stcMontant", e.stcMontant());
                    return valeurs;
                }).toList();
        Map<String, Object> donnees = new LinkedHashMap<>();
        donnees.put("mois", mois);
        donnees.put("vue", new VueProposeeDto("paie", "analytique", filtre.parametres(derniere)).enJson());
        return donnees;
    }

    @McpTool(name = "paie_mouvements", title = "Arrivées, départs et mutations par mois", generateOutputSchema = true,
            description = """
                    Mouvements d'effectif mois par mois selon la paie, sur un périmètre. Pour chaque mois : employés payés \
                    (`effectif`), effectif du mois précédent et écart net (`variation`), `entrees` (payés ce mois-ci et absents \
                    de la paie du mois précédent), `plusPayes` (payés le mois précédent, absents ce mois-ci), `sorties` (départs \
                    enregistrés sur la fiche employé) et `mutations` (changements de chantier). Chaque chiffre est défini dans \
                    `definitions` : citer ces définitions, et donner `variation` à côté des entrées, car « entrées » n'est pas \
                    l'écart net (entrées − plus payés = variation). Un mois précis ou les derniers mois ; 36 au plus.""",
            annotations = @McpTool.McpAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true,
                    openWorldHint = false))
    @PreAuthorize("hasAuthority('PAIE_READ')")
    @AuditableAction(action = "MCP_PAIE_MOUVEMENTS", categorie = CategorieAudit.ACCES, perimetre = PerimetreLectureMcp.class)
    public Map<String, Object> paieMouvements(
            @McpToolParam(required = false, description = "Un mois précis au format aaaa-MM. Absent = les derniers mois "
                    + "(selon `limite`).") @Pattern(regexp = Formats.PERIODE) String periode,
            @McpToolParam(required = false, description = Formats.CHANTIERS_DOC) @Size(max = 50) List<@Min(0) Long> chantierIds,
            @McpToolParam(required = false, description = Formats.EQUIPES_DOC) @Size(max = 50) List<@Min(0) Long> equipeIds,
            @McpToolParam(required = false, description = Formats.FONCTIONS_DOC) @Size(max = 50) List<@Min(0) Long> fonctionIds,
            @McpToolParam(required = false, description = "Nombre de mois rendus quand `periode` est absente, de 1 à 36, 12 par "
                    + "défaut.") @Min(1) @Max(MOIS) Integer limite) {
        Filtre filtre = new Filtre(ids(chantierIds), ids(equipeIds), ids(fonctionIds));
        List<EffectifMoisDto> tendances = effectifs.tendances(
                new EffectifsCriteria(filtre.chantiers(), filtre.fonctions(), filtre.equipes()));
        YearMonth demande = PeriodePaie.demande(periode);
        List<EffectifMoisDto> retenus = demande != null
                ? tendances.stream().filter(m -> m.periode().equals(demande)).toList()
                : tendances.subList(Math.max(0, tendances.size() - (limite == null ? 12 : limite)), tendances.size());
        // Effectif payé de chaque mois, pour donner au modèle l'écart net sans qu'il le calcule.
        Map<YearMonth, Long> payesParMois = new HashMap<>();
        tendances.forEach(m -> payesParMois.put(m.periode(), m.effectif()));
        List<Map<String, Object>> mois = retenus.stream().map(m -> {
            Long precedent = payesParMois.get(m.periode().minusMonths(1));
            Map<String, Object> valeurs = new LinkedHashMap<>();
            valeurs.put("periode", m.periode().toString());
            valeurs.put("effectif", m.effectif());
            valeurs.put("effectifMoisPrecedent", precedent);
            valeurs.put("variation", precedent == null ? null : m.effectif() - precedent);
            valeurs.put("entrees", m.entrees());
            // Payés le mois précédent, absents de ce mois : précédent + entrées − effectif.
            valeurs.put("plusPayes", precedent == null || m.entrees() == null ? null : precedent + m.entrees() - m.effectif());
            valeurs.put("sorties", m.sorties());
            valeurs.put("mutations", m.mutations());
            return valeurs;
        }).toList();
        Map<String, Object> donnees = new LinkedHashMap<>();
        donnees.put("mois", mois);
        donnees.put("definitions", DEFINITIONS_MOUVEMENTS);
        donnees.put("vue", new VueProposeeDto("employees", "analytique", filtre.parametres(demande)).enJson());
        return donnees;
    }

    @McpTool(name = "paie_qualite", title = "Qualité des données de paie", generateOutputSchema = true,
            description = """
                    Contrôle la qualité de la paie d'un mois sur un périmètre : nombre de bulletins sans équipe, nombre sans \
                    observation, et répartition des bulletins par tranches de salaire total. À utiliser pour « y a-t-il des \
                    anomalies », « combien de bulletins sans équipe ». Propose la liste des bulletins sans équipe.""",
            annotations = @McpTool.McpAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true,
                    openWorldHint = false))
    @PreAuthorize("hasAuthority('PAIE_READ')")
    @AuditableAction(action = "MCP_PAIE_QUALITE", categorie = CategorieAudit.ACCES, perimetre = PerimetreLectureMcp.class)
    public Map<String, Object> paieQualite(
            @McpToolParam(required = false, description = Formats.PERIODE_DOC) @Pattern(regexp = Formats.PERIODE) String periode,
            @McpToolParam(required = false, description = Formats.CHANTIERS_DOC) @Size(max = 50) List<@Min(0) Long> chantierIds,
            @McpToolParam(required = false, description = Formats.EQUIPES_DOC) @Size(max = 50) List<@Min(0) Long> equipeIds,
            @McpToolParam(required = false, description = Formats.FONCTIONS_DOC) @Size(max = 50) List<@Min(0) Long> fonctionIds) {
        Filtre filtre = new Filtre(ids(chantierIds), ids(equipeIds), ids(fonctionIds));
        YearMonth mois = periodes.ou(periode);
        PaieAnalytiqueDto resultat = analytique.analyser(filtre.criteres(mois));
        Map<String, Object> donnees = new LinkedHashMap<>();
        donnees.put("periode", mois.toString());
        donnees.put("sansEquipe", resultat.qualite().sansEquipe());
        donnees.put("sansObservation", resultat.qualite().sansObservation());
        donnees.put("tranches", resultat.tranches().stream().map(t -> {
            Map<String, Object> tranche = new LinkedHashMap<>();
            tranche.put("min", t.min());
            tranche.put("max", t.max());
            tranche.put("effectif", t.effectif());
            return tranche;
        }).toList());
        Map<String, String> parametres = filtre.parametres(mois);
        parametres.put("equipeIds", "0");
        donnees.put("vue", new VueProposeeDto("paie", "tabulaire", parametres).enJson());
        return donnees;
    }

    @McpTool(name = "paie_bulletins_rechercher", title = "Rechercher des bulletins de paie", generateOutputSchema = true,
            description = """
                    Trouve les bulletins de paie d'un mois par nom, CIN et/ou périmètre. Chaque bulletin rend : employé (id, nom, \
                    CIN), fonction, chantier, équipe, jours travaillés, jours de récupération, salaire mensuel, primes, salaire \
                    total en dirhams et observation. 20 bulletins au plus, avec le nombre total. À utiliser pour la paie d'une \
                    personne précise ; pour des totaux, préférer `paie_indicateurs`.""",
            annotations = @McpTool.McpAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true,
                    openWorldHint = false))
    @PreAuthorize("hasAuthority('PAIE_READ')")
    @AuditableAction(action = "MCP_PAIE_BULLETINS_RECHERCHER", categorie = CategorieAudit.ACCES, perimetre = PerimetreLectureMcp.class)
    public Map<String, Object> paieBulletinsRechercher(
            @McpToolParam(required = false, description = Formats.PERIODE_DOC) @Pattern(regexp = Formats.PERIODE) String periode,
            @McpToolParam(required = false, description = "Nom et/ou prénom de l'employé, partiel.") @Size(max = 150) String nom,
            @McpToolParam(required = false, description = "CIN de l'employé, partiel.") @Size(max = 30) String cin,
            @McpToolParam(required = false, description = Formats.CHANTIERS_DOC) @Size(max = 50) List<@Min(0) Long> chantierIds,
            @McpToolParam(required = false, description = Formats.EQUIPES_DOC) @Size(max = 50) List<@Min(0) Long> equipeIds,
            @McpToolParam(required = false, description = Formats.FONCTIONS_DOC) @Size(max = 50) List<@Min(0) Long> fonctionIds,
            @McpToolParam(required = false, description = "Nombre de bulletins rendus, de 1 à 20, 10 par défaut.")
            @Min(1) @Max(BULLETINS) Integer limite) {
        Filtre filtre = new Filtre(ids(chantierIds), ids(equipeIds), ids(fonctionIds));
        YearMonth mois = periodes.ou(periode);
        String nomRecherche = texte(nom);
        String cinRecherche = texte(cin);
        Page<PaieResponseDto> page = paie.search(
                new PaieSearchCriteria(cinRecherche, nomRecherche, mois, filtre.fonctions(), filtre.chantiers(), filtre.equipes()),
                PageRequest.of(0, limite == null ? 10 : limite, Sort.by("employee.nomPrenom")));
        List<Map<String, Object>> bulletins = page.getContent().stream().map(OutilsPaie::bulletin).toList();
        Map<String, String> parametres = filtre.parametres(mois);
        if (nomRecherche != null) {
            parametres.put("nom", nomRecherche);
        }
        if (cinRecherche != null) {
            parametres.put("cin", cinRecherche);
        }
        Map<String, Object> donnees = new LinkedHashMap<>();
        donnees.put("periode", mois.toString());
        donnees.put("total", page.getTotalElements());
        donnees.put("bulletins", bulletins);
        donnees.put("vue", new VueProposeeDto("paie", "tabulaire", parametres).enJson());
        return donnees;
    }

    @McpTool(name = "rapport_preparer", title = "Préparer le rapport de paie", generateOutputSchema = true,
            description = """
                    Prépare le rapport de paie PDF d'un mois : vérifie les chantiers concernés (id, code, effectif, masse) et \
                    propose d'ouvrir l'assistant d'export déjà réglé sur ce mois et ces chantiers. Ne génère aucun fichier : \
                    l'utilisateur lance lui-même l'export. Réservé aux utilisateurs qui peuvent exporter la paie.""",
            annotations = @McpTool.McpAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true,
                    openWorldHint = false))
    @PreAuthorize("hasAuthority('PAIE_EXPORT') and hasAuthority('PAIE_READ')")
    @AuditableAction(action = "MCP_RAPPORT_PREPARER", categorie = CategorieAudit.ACCES, perimetre = PerimetreLectureMcp.class)
    public Map<String, Object> rapportPreparer(
            @McpToolParam(required = false, description = Formats.PERIODE_DOC) @Pattern(regexp = Formats.PERIODE) String periode,
            @McpToolParam(required = false, description = "Identifiants des chantiers du rapport (rendus par "
                    + "`chantier_rechercher`). Absent = rapport complet.") @Size(max = 50) List<@Min(0) Long> chantierIds) {
        YearMonth mois = periodes.ou(periode);
        List<Long> chantiers = ids(chantierIds);
        List<PaieChantierPeriodeDto> concernes = paie.findChantiersDeLaPeriode(mois,
                chantiers == null ? null : new PaieSearchCriteria(null, null, mois, null, chantiers, null));
        List<Map<String, Object>> rendus = concernes.stream().limit(GROUPES).map(c -> {
            Map<String, Object> chantier = new LinkedHashMap<>();
            chantier.put("id", c.id());
            chantier.put("code", c.code());
            chantier.put("libelle", c.libelle());
            chantier.put("effectif", c.effectif());
            chantier.put("masse", c.masse());
            return chantier;
        }).toList();
        Map<String, String> parametres = new LinkedHashMap<>(Perimetres.parametresUrl(chantiers, null, null));
        parametres.put("periode", mois.toString());
        parametres.put("action", "export");
        Map<String, Object> donnees = new LinkedHashMap<>();
        donnees.put("periode", mois.toString());
        donnees.put("nombreChantiers", concernes.size());
        donnees.put("chantiers", rendus);
        donnees.put("vue", new VueProposeeDto("paie", "tabulaire", parametres).enJson());
        return donnees;
    }

    private static Map<String, Object> kpi(PaieAnalytiqueDto.Kpi k) {
        Map<String, Object> valeurs = new LinkedHashMap<>();
        valeurs.put("masse", k.masse());
        valeurs.put("effectif", k.effectif());
        valeurs.put("coutMoyen", k.coutMoyen());
        valeurs.put("nombreChantiers", k.nombreChantiers());
        valeurs.put("stc", k.stc());
        valeurs.put("stcMontant", k.stcMontant());
        return valeurs;
    }

    private static Map<String, Object> periode(PaiePeriodeResumeDto p) {
        Map<String, Object> valeurs = new LinkedHashMap<>();
        valeurs.put("periode", p.periode());
        valeurs.put("bulletins", p.nombreBulletins());
        valeurs.put("chantiers", p.nombreChantiers());
        valeurs.put("masse", p.masse());
        valeurs.put("stc", p.stc());
        valeurs.put("stcMontant", p.stcMontant());
        return valeurs;
    }

    private static Map<String, Object> groupe(Long id, String code, String libelle, Object masse, long effectif, long stc,
                                              Object stcMontant) {
        Map<String, Object> valeurs = new LinkedHashMap<>();
        valeurs.put("id", id);
        valeurs.put("code", code);
        valeurs.put("libelle", libelle);
        valeurs.put("masse", masse);
        valeurs.put("effectif", effectif);
        valeurs.put("stc", stc);
        valeurs.put("stcMontant", stcMontant);
        return valeurs;
    }

    private static Map<String, Object> bulletin(PaieResponseDto b) {
        Map<String, Object> valeurs = new LinkedHashMap<>();
        valeurs.put("id", b.id());
        valeurs.put("periode", b.periode().toString());
        if (b.employee() == null) {
            valeurs.put("employe", null);
        } else {
            Map<String, Object> employe = new LinkedHashMap<>();
            employe.put("id", b.employee().id());
            employe.put("nomPrenom", b.employee().nomPrenom());
            employe.put("cin", b.employee().cin());
            valeurs.put("employe", employe);
        }
        valeurs.put("fonction", b.fonction() == null ? null : b.fonction().libelle());
        valeurs.put("chantier", b.chantier() == null ? null : b.chantier().code());
        valeurs.put("equipe", b.equipe() == null ? null : b.equipe().code());
        valeurs.put("joursTravailles", b.nombreJoursTravailles());
        valeurs.put("joursRecuperationOuvrable", b.joursRecuperationOuvrable());
        valeurs.put("joursRecuperationDimanche", b.joursRecuperationDimanche());
        valeurs.put("salaireMensuel", b.salaireMensuel());
        valeurs.put("primeRoulageOrdinaire", b.primeRoulageOrdinaire());
        valeurs.put("primeRoulageDimanche", b.primeRoulageDimanche());
        valeurs.put("salaireTotal", b.salaireTotal());
        valeurs.put("observation", b.observation());
        return valeurs;
    }

    private static String texte(String valeur) {
        return valeur == null || valeur.isBlank() ? null : valeur.trim();
    }

    /** Périmètre chantier/équipe/fonction d'un appel, avec ses formes critère et URL. */
    private record Filtre(List<Long> chantiers, List<Long> equipes, List<Long> fonctions) {

        PaieSearchCriteria criteres(YearMonth periode) {
            return new PaieSearchCriteria(null, null, periode, fonctions, chantiers, equipes);
        }

        Map<String, String> parametres(YearMonth periode) {
            Map<String, String> parametres = new LinkedHashMap<>(Perimetres.parametresUrl(chantiers, equipes, fonctions));
            if (periode != null) {
                parametres.put("periode", periode.toString());
            }
            return parametres;
        }
    }
}

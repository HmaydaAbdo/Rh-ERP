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
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Component;
import org.springframework.validation.annotation.Validated;
import staport.rh.audit.annotations.AuditableAction;
import staport.rh.audit.entities.CategorieAudit;
import staport.rh.mcp.dtos.VueProposeeDto;
import staport.rh.paie.dtos.request.PaieSearchCriteria;
import staport.rh.paie.dtos.response.PaieAnalytiqueDto;
import staport.rh.paie.dtos.response.PaieComparaisonDto;
import staport.rh.paie.dtos.response.PaieRepartitionDto;
import staport.rh.paie.dtos.response.PaieRepartitionDto.Groupe;
import staport.rh.paie.dtos.response.PaieChantierPeriodeDto;
import staport.rh.paie.dtos.response.PaiePeriodeResumeDto;
import staport.rh.paie.dtos.response.PaieResponseDto;
import staport.rh.paie.effectifs.EffectifMoisDto;
import staport.rh.paie.effectifs.EffectifsCriteria;
import staport.rh.paie.services.interfaces.IPaieAnalytiqueService;
import staport.rh.paie.services.interfaces.IPaieEffectifsService;
import staport.rh.paie.services.interfaces.IPaieService;

import java.time.YearMonth;
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


    /** Critère de tri des groupes d'une répartition de paie (clé de la valeur dans chaque groupe). */
    public enum TriGroupePaie {
        MASSE, EFFECTIF, STC, STC_MONTANT, LIBELLE, CODE
    }

    /** Critère de tri d'une recherche de bulletins. */
    public enum TriBulletin {
        NOM("employee.nomPrenom"), SALAIRE_TOTAL("salaireTotal"), SALAIRE_MENSUEL("salaireMensuel"),
        JOURS_TRAVAILLES("nombreJoursTravailles");

        private final String propriete;

        TriBulletin(String propriete) {
            this.propriete = propriete;
        }
    }
    private static final int BULLETINS = 20;

    /** Critère de tri des groupes d'une comparaison de deux mois ; une valeur absente (groupe d'un seul mois) est rendue en dernier. */
    public enum TriComparaison { MASSE, VARIATION_MASSE, VARIATION_POURCENTAGE, EFFECTIF, VARIATION_EFFECTIF, LIBELLE }

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
                    compte (STC, départs payés) et leur montant. Rend aussi les mêmes chiffres pour le mois précédent et tous les \
                    chantiers du périmètre, classés par masse. C'est l'outil par défaut pour « combien coûte / combien d'employés payés ». \
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
        List<Map<String, Object>> chantiers = resultat.parChantier().stream()
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
        donnees.put("chantiers", chantiers);
        donnees.put("vue", new VueProposeeDto("paie", "analytique", filtre.parametres(mois)).enJson());
        return donnees;
    }

    @McpTool(name = "paie_periodes", title = "Mois de paie importés", generateOutputSchema = true,
            description = """
                    Liste les mois de paie importés, du plus récent au plus ancien, avec pour chacun le nombre de bulletins, le \
                    nombre de chantiers, la masse salariale en dirhams et les soldes de tout compte (STC), sur un périmètre. \
                    À utiliser pour savoir quels mois existent ou quel est le dernier mois de paie ; tous les mois importés sont rendus.""",
            annotations = @McpTool.McpAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true,
                    openWorldHint = false))
    @PreAuthorize("hasAuthority('PAIE_READ')")
    @AuditableAction(action = "MCP_PAIE_PERIODES", categorie = CategorieAudit.ACCES, perimetre = PerimetreLectureMcp.class)
    public Map<String, Object> paiePeriodes(
            @McpToolParam(required = false, description = Formats.CHANTIERS_DOC) @Size(max = 50) List<@Min(0) Long> chantierIds,
            @McpToolParam(required = false, description = Formats.EQUIPES_DOC) @Size(max = 50) List<@Min(0) Long> equipeIds,
            @McpToolParam(required = false, description = Formats.FONCTIONS_DOC) @Size(max = 50) List<@Min(0) Long> fonctionIds) {
        Filtre filtre = new Filtre(ids(chantierIds), ids(equipeIds), ids(fonctionIds));
        List<PaiePeriodeResumeDto> toutes = paie.findPeriodes(filtre.criteres(null));
        List<Map<String, Object>> rendues = toutes.stream().map(OutilsPaie::periode).toList();
        Map<String, Object> donnees = new LinkedHashMap<>();
        donnees.put("nombreMois", toutes.size());
        donnees.put("periodes", rendues);
        donnees.put("vue", new VueProposeeDto("paie", "cartes", filtre.parametres(null)).enJson());
        return donnees;
    }

    @McpTool(name = "paie_repartition", title = "Paie par chantier, équipe ou fonction", generateOutputSchema = true,
            description = """
                    Répartit la paie d'un mois par chantier, par équipe ou par fonction : masse salariale en dirhams, effectif \
                    payé et soldes de tout compte (STC) de chaque groupe. Tous les groupes sont rendus. De la plus grosse masse à la \
                    plus petite par défaut ; `tri` (MASSE, EFFECTIF, STC, STC_MONTANT, LIBELLE, CODE) et `sens` (ASC ou DESC) \
                    donnent « le chantier le moins cher », « les équipes avec le plus de STC ». À utiliser pour « quel chantier \
                    coûte le plus », « masse par équipe ». Pour les effectifs sans montants, `employes_regrouper` ; pour un \
                    seul chiffre global, `paie_indicateurs`.""",
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
            @McpToolParam(required = false, description = "Critère de tri des groupes : MASSE (défaut), EFFECTIF, STC, "
                    + "STC_MONTANT, LIBELLE ou CODE.") TriGroupePaie tri,
            @McpToolParam(required = false, description = SensTri.DOC) SensTri sens) {
        Filtre filtre = new Filtre(ids(chantierIds), ids(equipeIds), ids(fonctionIds));
        YearMonth mois = periodes.ou(periode);
        PaieRepartitionDto repartition = analytique.repartir(filtre.criteres(mois),
                PaieRepartitionDto.Dimension.valueOf(dimension.name()),
                tri == null ? null : PaieRepartitionDto.Tri.valueOf(tri.name()),
                sens == null ? null : sens == SensTri.ASC);
        List<Map<String, Object>> rendus = repartition.groupes().stream().map(OutilsPaie::groupe).toList();
        Map<String, Object> donnees = new LinkedHashMap<>();
        donnees.put("periode", repartition.periode());
        donnees.put("dimension", dimension.name());
        donnees.put("nombreGroupes", repartition.nombreGroupes());
        donnees.put("groupes", rendus);
        donnees.put("vue", new VueProposeeDto("paie", "analytique", filtre.parametres(mois)).enJson());
        return donnees;
    }

    @McpTool(name = "paie_evolution", title = "Évolution mensuelle de la paie", generateOutputSchema = true,
            description = """
                    Série mensuelle de la paie d'un périmètre, du mois le plus ancien au plus récent, jusqu'au mois donné : masse \
                    salariale en dirhams, effectif payé, soldes de tout compte (STC) et leur montant. À utiliser pour les \
                    tendances (« la masse augmente-t-elle ? »). Pour comparer seulement deux mois, `paie_indicateurs` rend déjà \
                    le mois précédent ; toute la série historique est rendue.""",
            annotations = @McpTool.McpAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true,
                    openWorldHint = false))
    @PreAuthorize("hasAuthority('PAIE_READ')")
    @AuditableAction(action = "MCP_PAIE_EVOLUTION", categorie = CategorieAudit.ACCES, perimetre = PerimetreLectureMcp.class)
    public Map<String, Object> paieEvolution(
            @McpToolParam(required = false, description = "Dernier mois de la série, au format aaaa-MM. Absent = le dernier "
                    + "mois de paie importé.") @Pattern(regexp = Formats.PERIODE) String periode,
            @McpToolParam(required = false, description = Formats.CHANTIERS_DOC) @Size(max = 50) List<@Min(0) Long> chantierIds,
            @McpToolParam(required = false, description = Formats.EQUIPES_DOC) @Size(max = 50) List<@Min(0) Long> equipeIds,
            @McpToolParam(required = false, description = Formats.FONCTIONS_DOC) @Size(max = 50) List<@Min(0) Long> fonctionIds) {
        Filtre filtre = new Filtre(ids(chantierIds), ids(equipeIds), ids(fonctionIds));
        YearMonth derniere = periodes.ou(periode);
        // L'évolution couvre tout l'historique du périmètre : on la borne au mois demandé (aaaa-MM se compare en texte).
        List<PaieAnalytiqueDto.Evolution> evolution = analytique.evolutionJusqua(filtre.criteres(derniere));
        List<Map<String, Object>> mois = evolution
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

    @McpTool(name = "paie_comparer", title = "Comparer la paie de deux mois", generateOutputSchema = true,
            description = """
                    Compare la paie de deux mois, groupe par groupe (par chantier, équipe ou fonction) : masse salariale, \
                    effectif et coût moyen de chaque mois, variation de la masse en dirhams et en pourcentage, variation de \
                    l'effectif, et la fonction la plus représentée de chaque chantier ou équipe. Tous les calculs sont faits \
                    ici : ne calcule jamais toi-même un écart, un pourcentage ou une moyenne, cite les valeurs rendues. \
                    `periode` est le mois récent (absent = dernier mois de paie) et `periodeReference` le mois de comparaison \
                    (absent = le mois précédent). `tri` et `sens` classent les groupes (MASSE du mois récent par défaut, \
                    VARIATION_MASSE, VARIATION_POURCENTAGE, EFFECTIF, VARIATION_EFFECTIF, LIBELLE). Tous les groupes sont \
                    rendus ; `plusForteHausse` et `plusForteBaisse` sont calculées sur tout le périmètre, comme les \
                    mêmes sur tout le périmètre (`...DuPerimetre`) et le total des deux mois. À utiliser pour « les 3 \
                    chantiers les plus chers puis lequel a le plus augmenté », « qu'est-ce qui a changé depuis le mois \
                    dernier ». Pour une série sur plusieurs mois, `paie_evolution`.""",
            annotations = @McpTool.McpAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true,
                    openWorldHint = false))
    @PreAuthorize("hasAuthority('PAIE_READ')")
    @AuditableAction(action = "MCP_PAIE_COMPARER", categorie = CategorieAudit.ACCES, perimetre = PerimetreLectureMcp.class)
    public Map<String, Object> paieComparer(
            @McpToolParam(description = "Regroupement : CHANTIER, EQUIPE ou FONCTION.") Dimension dimension,
            @McpToolParam(required = false, description = "Mois récent, au format aaaa-MM. Absent = le dernier mois de "
                    + "paie importé.") @Pattern(regexp = Formats.PERIODE) String periode,
            @McpToolParam(required = false, description = "Mois de comparaison, au format aaaa-MM. Absent = le mois "
                    + "précédent `periode`.") @Pattern(regexp = Formats.PERIODE) String periodeReference,
            @McpToolParam(required = false, description = Formats.CHANTIERS_DOC) @Size(max = 50) List<@Min(0) Long> chantierIds,
            @McpToolParam(required = false, description = Formats.EQUIPES_DOC) @Size(max = 50) List<@Min(0) Long> equipeIds,
            @McpToolParam(required = false, description = Formats.FONCTIONS_DOC) @Size(max = 50) List<@Min(0) Long> fonctionIds,
            @McpToolParam(required = false, description = "Critère de tri des groupes : MASSE (défaut, mois récent), "
                    + "VARIATION_MASSE, VARIATION_POURCENTAGE, EFFECTIF, VARIATION_EFFECTIF ou LIBELLE.") TriComparaison tri,
            @McpToolParam(required = false, description = SensTri.DOC) SensTri sens) {
        Filtre filtre = new Filtre(ids(chantierIds), ids(equipeIds), ids(fonctionIds));
        YearMonth recent = periodes.ou(periode);
        YearMonth reference = PeriodePaie.demande(periodeReference);
        PaieComparaisonDto resultat = analytique.comparer(filtre.criteres(recent),
                reference == null ? null : filtre.criteres(reference),
                PaieComparaisonDto.Dimension.valueOf(dimension.name()),
                tri == null ? PaieComparaisonDto.Tri.MASSE : PaieComparaisonDto.Tri.valueOf(tri.name()),
                SensTri.ou(sens, tri == null || tri != TriComparaison.LIBELLE ? SensTri.DESC : SensTri.ASC) == SensTri.ASC);
        Map<String, Object> donnees = new LinkedHashMap<>();
        donnees.put("periode", resultat.periode());
        donnees.put("periodeReference", resultat.periodeReference());
        donnees.put("dimension", resultat.dimension());
        donnees.put("nombreGroupes", resultat.nombreGroupes());
        donnees.put("total", resultat.total());
        donnees.put("plusForteHausse", resultat.plusForteHausse());
        donnees.put("plusForteBaisse", resultat.plusForteBaisse());
        donnees.put("plusForteHausseDuPerimetre", resultat.plusForteHausseDuPerimetre());
        donnees.put("plusForteBaisseDuPerimetre", resultat.plusForteBaisseDuPerimetre());
        donnees.put("groupes", resultat.groupes());
        donnees.put("definitions", resultat.definitions());
        donnees.put("vue", new VueProposeeDto("paie", "analytique", filtre.parametres(recent)).enJson());
        return donnees;
    }

    @McpTool(name = "paie_mouvements", title = "Arrivées, départs et mutations par mois", generateOutputSchema = true,
            description = """
                    Mouvements d'effectif mois par mois selon la paie, sur un périmètre. Pour chaque mois : employés payés \
                    (`effectif`), effectif du mois précédent et écart net (`variation`), `entrees` (payés ce mois-ci et absents \
                    de la paie du mois précédent), `plusPayes` (payés le mois précédent, absents ce mois-ci), `sorties` (départs \
                    enregistrés sur la fiche employé) et `mutations` (changements de chantier). Chaque chiffre est défini dans \
                    `definitions` : citer ces définitions, et donner `variation` à côté des entrées, car « entrées » n'est pas \
                    l'écart net (entrées − plus payés = variation). Un mois précis ou tous les mois disponibles.""",
            annotations = @McpTool.McpAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true,
                    openWorldHint = false))
    @PreAuthorize("hasAuthority('PAIE_READ')")
    @AuditableAction(action = "MCP_PAIE_MOUVEMENTS", categorie = CategorieAudit.ACCES, perimetre = PerimetreLectureMcp.class)
    public Map<String, Object> paieMouvements(
            @McpToolParam(required = false, description = "Un mois précis au format aaaa-MM. Absent = tous les mois disponibles.")
            @Pattern(regexp = Formats.PERIODE) String periode,
            @McpToolParam(required = false, description = Formats.CHANTIERS_DOC) @Size(max = 50) List<@Min(0) Long> chantierIds,
            @McpToolParam(required = false, description = Formats.EQUIPES_DOC) @Size(max = 50) List<@Min(0) Long> equipeIds,
            @McpToolParam(required = false, description = Formats.FONCTIONS_DOC) @Size(max = 50) List<@Min(0) Long> fonctionIds) {
        Filtre filtre = new Filtre(ids(chantierIds), ids(equipeIds), ids(fonctionIds));
        YearMonth demande = PeriodePaie.demande(periode);
        List<EffectifMoisDto> retenus = effectifs.tendances(
                new EffectifsCriteria(filtre.chantiers(), filtre.fonctions(), filtre.equipes()), demande);
        List<Map<String, Object>> mois = retenus.stream().map(m -> {
            Map<String, Object> valeurs = new LinkedHashMap<>();
            valeurs.put("periode", m.periode().toString());
            valeurs.put("effectif", m.effectif());
            valeurs.put("effectifMoisPrecedent", m.effectifMoisPrecedent());
            valeurs.put("variation", m.variation());
            valeurs.put("entrees", m.entrees());
            valeurs.put("plusPayes", m.plusPayes());
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
                    total en dirhams et observation. Les résultats sont paginés avec le nombre total ; parcourir toutes les pages \
                    pour une réponse complète. Triable (`tri` : NOM \
                    par défaut, SALAIRE_TOTAL, SALAIRE_MENSUEL, JOURS_TRAVAILLES ; `sens` ASC ou DESC) et paginable (`page`) : \
                    « les dix plus gros salaires du mois » se demande avec tri SALAIRE_TOTAL, sens DESC, limite 10. À utiliser \
                    pour la paie d'une personne ou un classement ; pour des totaux, préférer `paie_indicateurs`.""",
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
            @McpToolParam(required = false, description = "Nombre de bulletins rendus par page, de 1 à 20, 10 par défaut.")
            @Min(1) @Max(BULLETINS) Integer limite,
            @McpToolParam(required = false, description = "Critère de tri : NOM (défaut), SALAIRE_TOTAL, SALAIRE_MENSUEL "
                    + "ou JOURS_TRAVAILLES.") TriBulletin tri,
            @McpToolParam(required = false, description = SensTri.DOC) SensTri sens,
            @McpToolParam(required = false, description = SensTri.PAGE_DOC) @Min(0) Integer page) {
        Filtre filtre = new Filtre(ids(chantierIds), ids(equipeIds), ids(fonctionIds));
        YearMonth mois = periodes.ou(periode);
        String nomRecherche = texte(nom);
        String cinRecherche = texte(cin);
        TriBulletin critere = tri == null ? TriBulletin.NOM : tri;
        SensTri ordre = SensTri.ou(sens, critere == TriBulletin.NOM ? SensTri.ASC : SensTri.DESC);
        Page<PaieResponseDto> resultats = paie.search(
                new PaieSearchCriteria(cinRecherche, nomRecherche, mois, filtre.fonctions(), filtre.chantiers(), filtre.equipes()),
                PageRequest.of(page == null ? 0 : page, limite == null ? 10 : limite,
                        ordre.sur(critere.propriete, "employee.nomPrenom")));
        List<Map<String, Object>> bulletins = resultats.getContent().stream().map(OutilsPaie::bulletin).toList();
        Map<String, String> parametres = filtre.parametres(mois);
        if (nomRecherche != null) {
            parametres.put("nom", nomRecherche);
        }
        if (cinRecherche != null) {
            parametres.put("cin", cinRecherche);
        }
        Map<String, Object> donnees = new LinkedHashMap<>();
        donnees.put("periode", mois.toString());
        donnees.put("total", resultats.getTotalElements());
        donnees.put("page", resultats.getNumber());
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
        List<Map<String, Object>> rendus = concernes.stream().map(c -> {
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

    private static Map<String, Object> groupe(Groupe groupe) {
        Map<String, Object> valeurs = new LinkedHashMap<>();
        valeurs.put("id", groupe.id());
        valeurs.put("code", groupe.code());
        valeurs.put("libelle", groupe.libelle());
        valeurs.put("masse", groupe.masse());
        valeurs.put("effectif", groupe.effectif());
        valeurs.put("stc", groupe.stc());
        valeurs.put("stcMontant", groupe.stcMontant());
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

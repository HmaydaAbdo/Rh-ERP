package staport.rh.mcp.outils;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Positive;
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
import staport.rh.chantier.dtos.request.ChantierSearchCriteria;
import staport.rh.chantier.dtos.response.ChantierResponseDto;
import staport.rh.chantier.services.interfaces.IChantierService;
import staport.rh.equipe.dtos.request.EquipeSearchCriteria;
import staport.rh.equipe.dtos.response.EquipeResponseDto;
import staport.rh.equipe.services.interfaces.IEquipeService;
import staport.rh.function.dtos.request.FunctionSearchCriteria;
import staport.rh.function.dtos.response.FunctionResponseDto;
import staport.rh.function.services.interfaces.IFunctionService;
import staport.rh.mcp.dtos.VueProposeeDto;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * Outils des référentiels Chantier, Équipe et Fonction : rechercher par pages de 20 et lire une fiche. Les identifiants
 * rendus servent à filtrer les outils Paie et Employé. Vocabulaire chantier : {@code EN_COURS} / {@code CLOTURE}.
 *
 * <p>Tout est porté par les frameworks : le catalogue et ses schémas par Spring AI ({@code @McpTool}), la permission par
 * Spring Security ({@code @PreAuthorize}, ses refus sont audités par l'écouteur d'événements de sécurité), les bornes
 * des arguments par Bean Validation, la trace de chaque lecture par {@code @AuditableAction}.
 */
@Component
@Validated
@ConditionalOnBooleanProperty("security.mcp.enabled")
public class OutilsReferentiels {

    private static final int LIMITE = 20;

    private final IChantierService chantiers;
    private final IEquipeService equipes;
    private final IFunctionService fonctions;

    OutilsReferentiels(IChantierService chantiers, IEquipeService equipes, IFunctionService fonctions) {
        this.chantiers = chantiers;
        this.equipes = equipes;
        this.fonctions = fonctions;
    }

    /** Statut d'un chantier dans le vocabulaire de l'interface. */
    public enum StatutChantier { EN_COURS, CLOTURE }

    /** Critère de tri des chantiers. */
    public enum TriChantier { CODE, NOM, DESIGNATION }

    /** Critère de tri des équipes. */
    public enum TriEquipe { CODE, LIBELLE }

    @McpTool(name = "chantier_rechercher", title = "Rechercher des chantiers", generateOutputSchema = true,
            description = """
                    Trouve des chantiers (sites de construction) par leur code, nom ou désignation, éventuellement filtrés par statut. \
                    À utiliser en premier dès que la question cite un chantier par son nom ou son code : l'identifiant rendu (`id`) \
                    sert ensuite de filtre `chantierIds` aux outils Paie et Employé, ou de paramètre de `chantier_fiche`. \
                    Rend, pour chaque chantier : id, code, désignation, nom, origine ERP et statut (EN_COURS ou CLOTURE), plus le \
                    nombre total trouvé. 20 résultats au plus par page ; si `total` dépasse ce qui est rendu, parcourir toutes \
                    les pages (`page`) jusqu'au total pour une réponse complète. Triable : `tri` CODE (défaut), NOM ou DESIGNATION, `sens` ASC \
                    ou DESC.""",
            annotations = @McpTool.McpAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true,
                    openWorldHint = false))
    @PreAuthorize("hasAuthority('CHANTIER_READ')")
    @AuditableAction(action = "MCP_CHANTIER_RECHERCHER", categorie = CategorieAudit.ACCES, perimetre = PerimetreLectureMcp.class)
    public Map<String, Object> chantierRechercher(
            @McpToolParam(required = false, description = "Texte partiel du code, du nom ou de la désignation, par exemple "
                    + "« C-1042 » ou « Casablanca ». Absent = tous les chantiers.") @Size(max = 100) String recherche,
            @McpToolParam(required = false, description = "EN_COURS (chantier actif) ou CLOTURE. Absent = les deux.")
            StatutChantier statut,
            @McpToolParam(required = false, description = "Nombre de chantiers rendus par page, de 1 à 20, 10 par défaut.")
            @Min(1) @Max(LIMITE) Integer limite,
            @McpToolParam(required = false, description = "Critère de tri : CODE (défaut), NOM ou DESIGNATION.")
            TriChantier tri,
            @McpToolParam(required = false, description = SensTri.DOC) SensTri sens,
            @McpToolParam(required = false, description = SensTri.PAGE_DOC) @Min(0) Integer page) {
        String texte = texte(recherche);
        Boolean actif = statut == null ? null : statut == StatutChantier.EN_COURS;
        String critere = (tri == null ? TriChantier.CODE : tri).name().toLowerCase(java.util.Locale.ROOT);
        Page<ChantierResponseDto> resultats = chantiers.search(new ChantierSearchCriteria(null, null, texte, actif),
                page(limite, page, critere, sens));
        Map<String, String> parametres = new LinkedHashMap<>();
        if (resultats.getNumberOfElements() == 1) {
            parametres.put("code", resultats.getContent().getFirst().code());
        }
        if (actif != null) {
            parametres.put("actif", actif.toString());
        }
        return liste("chantiers", resultats, OutilsReferentiels::chantier, new VueProposeeDto("chantiers", "tabulaire", parametres));
    }

    @McpTool(name = "chantier_fiche", title = "Fiche d'un chantier", generateOutputSchema = true,
            description = """
                    Lit la fiche d'un chantier à partir de son identifiant : code, désignation, nom, origine ERP, statut. \
                    Identifiant inconnu : le chercher d'abord avec `chantier_rechercher`. Propose la vue Fiche du chantier.""",
            annotations = @McpTool.McpAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true,
                    openWorldHint = false))
    @PreAuthorize("hasAuthority('CHANTIER_READ')")
    @AuditableAction(action = "MCP_CHANTIER_FICHE", categorie = CategorieAudit.ACCES, perimetre = PerimetreLectureMcp.class)
    public Map<String, Object> chantierFiche(
            @McpToolParam(description = "Identifiant du chantier (entier positif), rendu par `chantier_rechercher`.")
            @Positive Long id) {
        ChantierResponseDto c = chantiers.findById(id);
        return fiche("chantier", chantier(c), "chantiers", c.id());
    }

    @McpTool(name = "equipe_rechercher", title = "Rechercher des équipes", generateOutputSchema = true,
            description = """
                    Trouve des équipes (groupes d'ouvriers) par code ou libellé. À utiliser quand la question cite une équipe : \
                    l'identifiant rendu sert de filtre `equipeIds` aux outils Paie et Employé (l'identifiant 0 y désigne les \
                    employés sans équipe). Rend id, code et libellé, plus le nombre total ; 20 résultats au plus par page \
                    (`page`). Parcourir toutes les pages jusqu'au total pour une réponse complète. Triable : `tri` CODE \
                    (défaut) ou LIBELLE, `sens` ASC ou DESC.""",
            annotations = @McpTool.McpAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true,
                    openWorldHint = false))
    @PreAuthorize("hasAuthority('EQUIPE_READ')")
    @AuditableAction(action = "MCP_EQUIPE_RECHERCHER", categorie = CategorieAudit.ACCES, perimetre = PerimetreLectureMcp.class)
    public Map<String, Object> equipeRechercher(
            @McpToolParam(required = false, description = "Texte partiel du code ou du libellé. Absent = toutes les équipes.")
            @Size(max = 100) String recherche,
            @McpToolParam(required = false, description = "Nombre d'équipes rendues par page, de 1 à 20, 10 par défaut.")
            @Min(1) @Max(LIMITE) Integer limite,
            @McpToolParam(required = false, description = "Critère de tri : CODE (défaut) ou LIBELLE.") TriEquipe tri,
            @McpToolParam(required = false, description = SensTri.DOC) SensTri sens,
            @McpToolParam(required = false, description = SensTri.PAGE_DOC) @Min(0) Integer page) {
        Page<EquipeResponseDto> resultats = equipes.search(new EquipeSearchCriteria(null, null, texte(recherche)),
                page(limite, page, (tri == null ? TriEquipe.CODE : tri).name().toLowerCase(java.util.Locale.ROOT), sens));
        Map<String, String> parametres = new LinkedHashMap<>();
        if (texte(recherche) != null) {
            parametres.put("code", texte(recherche));
        }
        return liste("equipes", resultats, OutilsReferentiels::equipe, new VueProposeeDto("equipes", "tabulaire", parametres));
    }

    @McpTool(name = "equipe_fiche", title = "Fiche d'une équipe", generateOutputSchema = true,
            description = "Lit la fiche d'une équipe à partir de son identifiant : code et libellé. Identifiant inconnu : le "
                    + "chercher d'abord avec `equipe_rechercher`.",
            annotations = @McpTool.McpAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true,
                    openWorldHint = false))
    @PreAuthorize("hasAuthority('EQUIPE_READ')")
    @AuditableAction(action = "MCP_EQUIPE_FICHE", categorie = CategorieAudit.ACCES, perimetre = PerimetreLectureMcp.class)
    public Map<String, Object> equipeFiche(
            @McpToolParam(description = "Identifiant de l'équipe (entier positif), rendu par `equipe_rechercher`.")
            @Positive Long id) {
        EquipeResponseDto e = equipes.findById(id);
        return fiche("equipe", equipe(e), "equipes", e.id());
    }

    @McpTool(name = "fonction_rechercher", title = "Rechercher des fonctions", generateOutputSchema = true,
            description = """
                    Trouve des fonctions (métiers : maçon, électricien, chef de chantier…) par libellé. À utiliser quand la \
                    question cite un métier : l'identifiant rendu sert de filtre `fonctionIds` aux outils Paie et Employé. \
                    Rend id et libellé, plus le nombre total ; 20 résultats au plus par page (`page`). Parcourir toutes les \
                    pages jusqu'au total pour une réponse complète ; triés par libellé (`sens` ASC ou DESC).""",
            annotations = @McpTool.McpAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true,
                    openWorldHint = false))
    @PreAuthorize("hasAuthority('FUNCTION_READ')")
    @AuditableAction(action = "MCP_FONCTION_RECHERCHER", categorie = CategorieAudit.ACCES, perimetre = PerimetreLectureMcp.class)
    public Map<String, Object> fonctionRechercher(
            @McpToolParam(required = false, description = "Texte partiel du libellé du métier. Absent = toutes les fonctions.")
            @Size(max = 100) String recherche,
            @McpToolParam(required = false, description = "Nombre de fonctions rendues par page, de 1 à 20, 10 par défaut.")
            @Min(1) @Max(LIMITE) Integer limite,
            @McpToolParam(required = false, description = SensTri.DOC) SensTri sens,
            @McpToolParam(required = false, description = SensTri.PAGE_DOC) @Min(0) Integer page) {
        Page<FunctionResponseDto> resultats = fonctions.search(new FunctionSearchCriteria(texte(recherche)),
                page(limite, page, "libelle", sens));
        Map<String, String> parametres = new LinkedHashMap<>();
        if (texte(recherche) != null) {
            parametres.put("libelle", texte(recherche));
        }
        return liste("fonctions", resultats, OutilsReferentiels::fonction, new VueProposeeDto("functions", "tabulaire", parametres));
    }

    @McpTool(name = "fonction_fiche", title = "Fiche d'une fonction", generateOutputSchema = true,
            description = "Lit la fiche d'une fonction (métier) à partir de son identifiant. Identifiant inconnu : le chercher "
                    + "d'abord avec `fonction_rechercher`.",
            annotations = @McpTool.McpAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true,
                    openWorldHint = false))
    @PreAuthorize("hasAuthority('FUNCTION_READ')")
    @AuditableAction(action = "MCP_FONCTION_FICHE", categorie = CategorieAudit.ACCES, perimetre = PerimetreLectureMcp.class)
    public Map<String, Object> fonctionFiche(
            @McpToolParam(description = "Identifiant de la fonction (entier positif), rendu par `fonction_rechercher`.")
            @Positive Long id) {
        FunctionResponseDto f = fonctions.findById(id);
        return fiche("fonction", fonction(f), "functions", f.id());
    }

    private static <T> Map<String, Object> liste(String cle, Page<T> page, Function<T, Map<String, Object>> enJson,
                                                 VueProposeeDto vue) {
        List<Map<String, Object>> elements = page.getContent().stream().map(enJson).toList();
        Map<String, Object> donnees = new LinkedHashMap<>();
        donnees.put("total", page.getTotalElements());
        donnees.put("rendus", elements.size());
        donnees.put("page", page.getNumber());
        donnees.put(cle, elements);
        donnees.put("vue", vue.enJson());
        return donnees;
    }

    private static Map<String, Object> fiche(String cle, Map<String, Object> valeurs, String module, Long id) {
        Map<String, Object> donnees = new LinkedHashMap<>();
        donnees.put(cle, valeurs);
        donnees.put("vue", new VueProposeeDto(module, "fiche", Map.of("id", String.valueOf(id))).enJson());
        return donnees;
    }

    private static String texte(String valeur) {
        return valeur == null || valeur.isBlank() ? null : valeur.trim();
    }

    /** Une page triée : défaut croissant sur le critère, départagé par l'identifiant pour un ordre stable. */
    static PageRequest page(Integer limite, Integer page, String tri, SensTri sens) {
        return PageRequest.of(page == null ? 0 : page, limite == null ? 10 : limite,
                SensTri.ou(sens, SensTri.ASC).sur(tri, "id"));
    }

    static Map<String, Object> chantier(ChantierResponseDto c) {
        Map<String, Object> valeurs = new LinkedHashMap<>();
        valeurs.put("id", c.id());
        valeurs.put("code", c.code());
        valeurs.put("designation", c.designation());
        valeurs.put("nom", c.nom());
        valeurs.put("sourceErp", c.sourceErp());
        valeurs.put("statut", c.actif() ? "EN_COURS" : "CLOTURE");
        return valeurs;
    }

    private static Map<String, Object> equipe(EquipeResponseDto e) {
        Map<String, Object> valeurs = new LinkedHashMap<>();
        valeurs.put("id", e.id());
        valeurs.put("code", e.code());
        valeurs.put("libelle", e.libelle());
        return valeurs;
    }

    private static Map<String, Object> fonction(FunctionResponseDto f) {
        Map<String, Object> valeurs = new LinkedHashMap<>();
        valeurs.put("id", f.id());
        valeurs.put("libelle", f.libelle());
        return valeurs;
    }
}

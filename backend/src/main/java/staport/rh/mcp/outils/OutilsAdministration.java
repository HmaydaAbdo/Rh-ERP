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
import org.springframework.data.domain.Sort;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Component;
import org.springframework.validation.annotation.Validated;
import staport.rh.audit.annotations.AuditableAction;
import staport.rh.audit.dtos.request.AuditSearchCriteria;
import staport.rh.audit.dtos.response.AuditJournalLigneDto;
import staport.rh.audit.dtos.response.AuditVersionDto;
import staport.rh.audit.entities.CategorieAudit;
import staport.rh.audit.entities.ResultatAudit;
import staport.rh.audit.services.interfaces.IAuditJournalService;
import staport.rh.auth.dtos.request.RoleSearchCriteria;
import staport.rh.auth.dtos.response.PermissionResponseDto;
import staport.rh.auth.dtos.response.RoleResponseDto;
import staport.rh.auth.services.interfaces.IRoleService;
import staport.rh.mcp.dtos.VueProposeeDto;
import staport.rh.parametre.dtos.response.ParametreResponseDto;
import staport.rh.parametre.services.interfaces.IParametreService;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Outils d'administration, chacun sous la permission de son écran : paramètres de fonctionnement, rôles et leurs
 * permissions, journal d'audit et historique d'un enregistrement. La liste des comptes utilisateurs n'est pas exposée.
 * Mécanique portée par les frameworks, comme {@link OutilsReferentiels}.
 */
@Component
@Validated
@ConditionalOnBooleanProperty("security.mcp.enabled")
public class OutilsAdministration {

    private static final int LIGNES = 20;
    private static final int VERSIONS = 10;
    private static final String DATE = "^[0-9]{4}-[0-9]{2}-[0-9]{2}$";

    private final IParametreService parametres;
    private final IRoleService roles;
    private final IAuditJournalService journal;

    OutilsAdministration(IParametreService parametres, IRoleService roles, IAuditJournalService journal) {
        this.parametres = parametres;
        this.roles = roles;
        this.journal = journal;
    }

    /** Entités historisées que l'on peut consulter (noms JPA des entités auditées). */
    public enum Entite { Paie, Employee, Chantier, Equipe, Function, Role, Parametre }

    @McpTool(name = "parametres_lire", title = "Paramètres de l'application", generateOutputSchema = true,
            description = """
                    Lit les paramètres de fonctionnement de l'application : clé, libellé, description, valeur, unité et bornes \
                    (durées de session, planification de la synchronisation des chantiers, etc.). Réservé aux administrateurs \
                    qui voient l'écran Paramètres.""",
            annotations = @McpTool.McpAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true,
                    openWorldHint = false))
    @PreAuthorize("hasAuthority('PARAMETRE_READ')")
    @AuditableAction(action = "MCP_PARAMETRES_LIRE", categorie = CategorieAudit.ACCES, perimetre = PerimetreLectureMcp.class)
    public Map<String, Object> parametresLire() {
        List<Map<String, Object>> valeurs = parametres.findAll().stream().map(OutilsAdministration::parametre).toList();
        Map<String, Object> donnees = new LinkedHashMap<>();
        donnees.put("parametres", valeurs);
        donnees.put("vue", new VueProposeeDto("admin/parametres", "tabulaire", Map.of()).enJson());
        return donnees;
    }

    @McpTool(name = "roles_lister", title = "Rôles et permissions", generateOutputSchema = true,
            description = """
                    Liste les rôles et les permissions que chacun accorde (jamais les comptes utilisateurs), avec un filtre \
                    facultatif sur le nom. À utiliser pour « qui peut voir la paie », « que permet le rôle X ». Réservé aux \
                    utilisateurs qui gèrent les rôles ; résultats paginés avec le nombre total. Parcourir les pages jusqu'au total.""",
            annotations = @McpTool.McpAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true,
                    openWorldHint = false))
    @PreAuthorize("hasAuthority('ROLE_MANAGE')")
    @AuditableAction(action = "MCP_ROLES_LISTER", categorie = CategorieAudit.ACCES, perimetre = PerimetreLectureMcp.class)
    public Map<String, Object> rolesLister(
            @McpToolParam(required = false, description = "Nom du rôle, partiel. Absent = tous les rôles.") @Size(max = 50) String nom,
            @McpToolParam(required = false, description = "Nombre de rôles rendus par page, de 1 à 20, 20 par défaut.")
            @Min(1) @Max(LIGNES) Integer limite,
            @McpToolParam(required = false, description = SensTri.PAGE_DOC) @Min(0) Integer page) {
        Page<RoleResponseDto> resultats = roles.search(new RoleSearchCriteria(texte(nom), null),
                PageRequest.of(page == null ? 0 : page, limite == null ? LIGNES : limite, Sort.by("nom")));
        List<Map<String, Object>> rendus = resultats.getContent().stream().map(r -> {
            Map<String, Object> role = new LinkedHashMap<>();
            role.put("id", r.id());
            role.put("nom", r.nom());
            role.put("description", r.description());
            role.put("protege", r.protege());
            role.put("permissions", r.permissions().stream().map(PermissionResponseDto::code).sorted().toList());
            return role;
        }).toList();
        Map<String, Object> donnees = new LinkedHashMap<>();
        donnees.put("total", resultats.getTotalElements());
        donnees.put("page", resultats.getNumber());
        donnees.put("roles", rendus);
        donnees.put("vue", new VueProposeeDto("admin/roles", "tabulaire", Map.of()).enJson());
        return donnees;
    }

    @McpTool(name = "audit_rechercher", title = "Journal d'audit", generateOutputSchema = true,
            description = """
                    Cherche dans le journal d'audit, des entrées les plus récentes aux plus anciennes : horodatage, catégorie, \
                    action, résultat, utilisateur, entité, nombre d'éléments, motif. Tous les filtres sont facultatifs et se \
                    combinent. À utiliser pour « qui a fait quoi », « quels accès refusés cette semaine ». Pour l'historique \
                    d'un enregistrement précis, `audit_historique`. Réservé aux utilisateurs qui voient le journal ; résultats \
                    paginés avec le nombre total. Parcourir les pages jusqu'au total.""",
            annotations = @McpTool.McpAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true,
                    openWorldHint = false))
    @PreAuthorize("hasAuthority('AUDIT_READ')")
    @AuditableAction(action = "MCP_AUDIT_RECHERCHER", categorie = CategorieAudit.ACCES, perimetre = PerimetreLectureMcp.class)
    public Map<String, Object> auditRechercher(
            @McpToolParam(required = false, description = "Date de début incluse, au format aaaa-MM-jj.")
            @Pattern(regexp = DATE) String depuis,
            @McpToolParam(required = false, description = "Date de fin incluse, au format aaaa-MM-jj.")
            @Pattern(regexp = DATE) String jusqua,
            @McpToolParam(required = false, description = "Identifiant de connexion de l'utilisateur, partiel.")
            @Size(max = 100) String utilisateur,
            @McpToolParam(required = false, description = "Code exact de l'action, par exemple EMPLOYE_SORTIE.")
            @Size(max = 100) String action,
            @McpToolParam(required = false, description = "Catégorie de l'entrée.") CategorieAudit categorie,
            @McpToolParam(required = false, description = "Résultat de l'action : SUCCES ou ECHEC.") ResultatAudit resultat,
            @McpToolParam(required = false, description = "Type de l'enregistrement concerné.") Entite entite,
            @McpToolParam(required = false, description = "Identifiant de l'enregistrement concerné (entier positif).")
            @Positive Long entiteId,
            @McpToolParam(required = false, description = "Nombre d'entrées rendues par page, de 1 à 20, 20 par défaut.")
            @Min(1) @Max(LIGNES) Integer limite,
            @McpToolParam(required = false, description = SensTri.PAGE_DOC) @Min(0) Integer page) {
        AuditSearchCriteria criteres = new AuditSearchCriteria(
                date(depuis, "depuis", false), date(jusqua, "jusqua", true), texte(utilisateur), categorie, texte(action),
                resultat, entite == null ? null : entite.name(), entiteId, null, null, null, null);
        Page<AuditJournalLigneDto> resultats = journal.search(criteres,
                PageRequest.of(page == null ? 0 : page, limite == null ? LIGNES : limite,
                        Sort.by(Sort.Direction.DESC, "horodatage")));
        List<Map<String, Object>> entrees = resultats.getContent().stream().map(OutilsAdministration::ligne).toList();
        Map<String, Object> donnees = new LinkedHashMap<>();
        donnees.put("total", resultats.getTotalElements());
        donnees.put("page", resultats.getNumber());
        donnees.put("entrees", entrees);
        donnees.put("vue", new VueProposeeDto("audit", "tabulaire", Map.of()).enJson());
        return donnees;
    }

    @McpTool(name = "audit_historique", title = "Historique d'un enregistrement", generateOutputSchema = true,
            description = """
                    Historique d'un enregistrement (bulletin, employé, chantier, équipe, fonction, rôle ou paramètre) : ses \
                    versions de la plus récente à la plus ancienne, avec l'auteur, l'opération et les champs modifiés \
                    (valeur avant et après). À utiliser pour « qui a modifié X et quand ». Réservé aux utilisateurs qui voient \
                    le journal ; résultats paginés avec le nombre total. Parcourir les pages jusqu'au total.""",
            annotations = @McpTool.McpAnnotations(readOnlyHint = true, destructiveHint = false, idempotentHint = true,
                    openWorldHint = false))
    @PreAuthorize("hasAuthority('AUDIT_READ')")
    @AuditableAction(action = "MCP_AUDIT_HISTORIQUE", categorie = CategorieAudit.ACCES, perimetre = PerimetreLectureMcp.class)
    public Map<String, Object> auditHistorique(
            @McpToolParam(description = "Type de l'enregistrement.") Entite entite,
            @McpToolParam(description = "Identifiant de l'enregistrement (entier positif), obtenu avec l'outil de recherche du "
                    + "domaine concerné.") @Positive Long id,
            @McpToolParam(required = false, description = "Nombre de versions rendues par page, de 1 à 10, 10 par défaut.")
            @Min(1) @Max(VERSIONS) Integer limite,
            @McpToolParam(required = false, description = SensTri.PAGE_DOC) @Min(0) Integer page) {
        Page<AuditVersionDto> resultats = journal.historique(entite.name(), id,
                PageRequest.of(page == null ? 0 : page, limite == null ? VERSIONS : limite));
        List<Map<String, Object>> versions = resultats.getContent().stream().map(OutilsAdministration::version).toList();
        Map<String, Object> donnees = new LinkedHashMap<>();
        donnees.put("total", resultats.getTotalElements());
        donnees.put("page", resultats.getNumber());
        donnees.put("versions", versions);
        return donnees;
    }

    /** Une date du jour (aaaa-MM-jj) en instant UTC : début du jour, ou début du jour suivant pour une borne de fin. */
    private static Instant date(String valeur, String nom, boolean fin) {
        if (valeur == null || valeur.isBlank()) {
            return null;
        }
        try {
            LocalDate jour = LocalDate.parse(valeur);
            return (fin ? jour.plusDays(1) : jour).atStartOfDay(ZoneOffset.UTC).toInstant();
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("« " + nom + " » doit être une date réelle au format aaaa-MM-jj.");
        }
    }

    private static String texte(String valeur) {
        return valeur == null || valeur.isBlank() ? null : valeur.trim();
    }

    private static Map<String, Object> parametre(ParametreResponseDto p) {
        Map<String, Object> valeurs = new LinkedHashMap<>();
        valeurs.put("cle", p.cle());
        valeurs.put("libelle", p.libelle());
        valeurs.put("description", p.description());
        valeurs.put("type", p.type() == null ? null : p.type().name());
        valeurs.put("valeur", p.valeur());
        valeurs.put("unite", p.unite());
        valeurs.put("minimum", p.minimum());
        valeurs.put("maximum", p.maximum());
        return valeurs;
    }

    private static Map<String, Object> ligne(AuditJournalLigneDto l) {
        Map<String, Object> valeurs = new LinkedHashMap<>();
        valeurs.put("id", l.id());
        valeurs.put("horodatage", l.horodatage() == null ? null : l.horodatage().toString());
        valeurs.put("categorie", l.categorie() == null ? null : l.categorie().name());
        valeurs.put("action", l.action());
        valeurs.put("resultat", l.resultat() == null ? null : l.resultat().name());
        valeurs.put("utilisateur", l.utilisateurNom());
        valeurs.put("origine", l.origine() == null ? null : l.origine().name());
        valeurs.put("entite", l.entiteType());
        valeurs.put("entiteId", l.entiteId());
        valeurs.put("nombreElements", l.nombreElements());
        valeurs.put("motif", l.motif());
        return valeurs;
    }

    private static Map<String, Object> version(AuditVersionDto v) {
        Map<String, Object> valeurs = new LinkedHashMap<>();
        valeurs.put("revision", v.revision());
        valeurs.put("horodatage", v.horodatage() == null ? null : v.horodatage().toString());
        valeurs.put("utilisateur", v.utilisateurNom());
        valeurs.put("origine", v.origine() == null ? null : v.origine().name());
        valeurs.put("operation", v.operation());
        valeurs.put("champs", v.champs() == null ? List.of() : v.champs().stream().map(c -> {
            Map<String, Object> champ = new LinkedHashMap<>();
            champ.put("champ", c.champ());
            champ.put("avant", c.avant());
            champ.put("apres", c.apres());
            champ.put("ajoutes", c.ajoutes());
            champ.put("retires", c.retires());
            return champ;
        }).toList());
        return valeurs;
    }
}

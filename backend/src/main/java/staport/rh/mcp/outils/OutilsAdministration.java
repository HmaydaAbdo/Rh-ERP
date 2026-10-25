package staport.rh.mcp.outils;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import staport.rh.audit.dtos.request.AuditSearchCriteria;
import staport.rh.audit.dtos.response.AuditJournalLigneDto;
import staport.rh.audit.dtos.response.AuditVersionDto;
import staport.rh.audit.entities.CategorieAudit;
import staport.rh.audit.entities.ResultatAudit;
import staport.rh.audit.services.interfaces.IAuditJournalService;
import staport.rh.audit.services.interfaces.IAuditOutilsAgent;
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
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static staport.rh.mcp.outils.OutilDefini.enumeration;
import static staport.rh.mcp.outils.OutilDefini.identifiant;
import static staport.rh.mcp.outils.OutilDefini.limite;
import static staport.rh.mcp.outils.OutilDefini.liste;
import static staport.rh.mcp.outils.OutilDefini.nombre;
import static staport.rh.mcp.outils.OutilDefini.outil;
import static staport.rh.mcp.outils.OutilDefini.texte;

/**
 * Outils d'administration, chacun sous la permission de son écran : paramètres de fonctionnement, rôles et leurs
 * permissions, journal d'audit et historique d'un enregistrement. La liste des comptes utilisateurs n'est pas exposée.
 */
public final class OutilsAdministration {

    private static final int LIGNES = 20;
    private static final int VERSIONS = 10;
    /** Entités historisées que l'on peut consulter (noms JPA des entités auditées). */
    private static final String[] ENTITES = {"Paie", "Employee", "Chantier", "Equipe", "Function", "Role", "Parametre"};

    private OutilsAdministration() {
    }

    public static List<OutilLecture> catalogue(IParametreService parametres, IRoleService roles,
                                               IAuditJournalService journal, IAuditOutilsAgent audit) {
        return List.of(
                outil("parametres_lire")
                        .description("Paramètres de fonctionnement de l'application : clé, libellé, description, valeur, "
                                + "unité et bornes (durées de session, planification de la synchronisation…).")
                        .permissions("PARAMETRE_READ")
                        .entree(Map.of())
                        .sortie(Map.of("parametres", liste(), "vue", OutilLecture.vueProposee()), "parametres", "vue")
                        .execution((lecteur, arguments) -> {
                            List<Map<String, Object>> valeurs = parametres.findAll().stream().map(OutilsAdministration::parametre).toList();
                            Map<String, Object> donnees = new LinkedHashMap<>();
                            donnees.put("parametres", valeurs);
                            donnees.put("vue", new VueProposeeDto("admin/parametres", "tabulaire", Map.of()).enJson());
                            return new OutilLecture.Resultat(donnees, valeurs.size() + " paramètre(s).", valeurs.size(), Map.of());
                        })
                        .construire(audit),
                outil("roles_lister")
                        .description("Rôles et permissions qu'ils accordent (sans les comptes) ; filtre facultatif sur le nom.")
                        .permissions("ROLE_MANAGE")
                        .entree(Map.of("nom", texte("Nom du rôle, partiel", 50), "limite", limite(LIGNES, LIGNES)))
                        .sortie(Map.of("total", nombre(), "roles", liste(), "vue", OutilLecture.vueProposee()),
                                "total", "roles", "vue")
                        .execution((lecteur, arguments) -> {
                            Page<RoleResponseDto> page = roles.search(new RoleSearchCriteria(arguments.texte("nom").orElse(null), null),
                                    PageRequest.of(0, arguments.entier("limite", LIGNES, 1, LIGNES), Sort.by("nom")));
                            List<Map<String, Object>> rendus = page.getContent().stream().map(r -> {
                                Map<String, Object> role = new LinkedHashMap<>();
                                role.put("id", r.id());
                                role.put("nom", r.nom());
                                role.put("description", r.description());
                                role.put("protege", r.protege());
                                role.put("permissions", r.permissions().stream().map(PermissionResponseDto::code).sorted().toList());
                                return role;
                            }).toList();
                            Map<String, Object> donnees = new LinkedHashMap<>();
                            donnees.put("total", page.getTotalElements());
                            donnees.put("roles", rendus);
                            donnees.put("vue", new VueProposeeDto("admin/roles", "tabulaire", Map.of()).enJson());
                            return new OutilLecture.Resultat(donnees, page.getTotalElements() + " rôle(s).", rendus.size(), Map.of());
                        })
                        .construire(audit),
                outil("audit_rechercher")
                        .description("Entrées du journal d'audit, des plus récentes aux plus anciennes : horodatage, catégorie, "
                                + "action, résultat, utilisateur, entité, nombre d'éléments, motif. Filtres facultatifs ; "
                                + LIGNES + " entrées au plus.")
                        .permissions("AUDIT_READ")
                        .entree(Map.of(
                                "depuis", texte("Date de début incluse, aaaa-MM-jj", 10),
                                "jusqua", texte("Date de fin incluse, aaaa-MM-jj", 10),
                                "utilisateur", texte("Identifiant de connexion, partiel", 100),
                                "action", texte("Action exacte, ex. EMPLOYE_SORTIE", 100),
                                "categorie", enumeration("Catégorie", noms(CategorieAudit.values())),
                                "resultat", enumeration("Résultat", noms(ResultatAudit.values())),
                                "entite", enumeration("Type d'entité", ENTITES),
                                "entiteId", identifiant("Identifiant de l'enregistrement"),
                                "limite", limite(LIGNES, LIGNES)))
                        .sortie(Map.of("total", nombre(), "entrees", liste(), "vue", OutilLecture.vueProposee()),
                                "total", "entrees", "vue")
                        .execution((lecteur, arguments) -> {
                            AuditSearchCriteria criteres = new AuditSearchCriteria(
                                    date(arguments, "depuis", false), date(arguments, "jusqua", true),
                                    arguments.texte("utilisateur").orElse(null),
                                    arguments.texte("categorie").map(CategorieAudit::valueOf).orElse(null),
                                    arguments.texte("action").orElse(null),
                                    arguments.texte("resultat").map(ResultatAudit::valueOf).orElse(null),
                                    arguments.texte("entite").orElse(null),
                                    arguments.identifiant("entiteId").orElse(null),
                                    null, null, null, null);
                            Page<AuditJournalLigneDto> page = journal.search(criteres,
                                    PageRequest.of(0, arguments.entier("limite", LIGNES, 1, LIGNES), Sort.by(Sort.Direction.DESC, "horodatage")));
                            List<Map<String, Object>> entrees = page.getContent().stream().map(OutilsAdministration::ligne).toList();
                            Map<String, Object> donnees = new LinkedHashMap<>();
                            donnees.put("total", page.getTotalElements());
                            donnees.put("entrees", entrees);
                            donnees.put("vue", new VueProposeeDto("audit", "tabulaire", Map.of()).enJson());
                            return new OutilLecture.Resultat(donnees, page.getTotalElements() + " entrée(s) du journal.",
                                    entrees.size(), Map.of());
                        })
                        .construire(audit),
                outil("audit_historique")
                        .description("Historique d'un enregistrement (bulletin, employé, chantier, équipe, fonction, rôle, "
                                + "paramètre) : versions de la plus récente à la plus ancienne, auteur, opération et champs "
                                + "modifiés avant/après ; " + VERSIONS + " versions au plus.")
                        .permissions("AUDIT_READ")
                        .entree(Map.of(
                                "entite", enumeration("Type d'entité", ENTITES),
                                "id", identifiant("Identifiant de l'enregistrement"),
                                "limite", limite(VERSIONS, VERSIONS)))
                        .sortie(Map.of("total", nombre(), "versions", liste()), "total", "versions")
                        .execution((lecteur, arguments) -> {
                            String entite = arguments.texte("entite")
                                    .orElseThrow(() -> OutilLecture.invalide("« entite » est obligatoire."));
                            long id = OutilsReferentiels.obligatoire(arguments);
                            Page<AuditVersionDto> page = journal.historique(entite, id,
                                    PageRequest.of(0, arguments.entier("limite", VERSIONS, 1, VERSIONS)));
                            List<Map<String, Object>> versions = page.getContent().stream().map(OutilsAdministration::version).toList();
                            Map<String, Object> donnees = new LinkedHashMap<>();
                            donnees.put("total", page.getTotalElements());
                            donnees.put("versions", versions);
                            return new OutilLecture.Resultat(donnees, page.getTotalElements() + " version(s) de " + entite + " " + id + ".",
                                    versions.size(), Map.of("entite", entite, "id", id));
                        })
                        .construire(audit));
    }

    private static String[] noms(Enum<?>[] valeurs) {
        return Arrays.stream(valeurs).map(Enum::name).toArray(String[]::new);
    }

    /** Une date du jour (aaaa-MM-jj) en instant UTC : début du jour, ou début du jour suivant pour une borne de fin. */
    private static Instant date(Arguments arguments, String nom, boolean fin) {
        return arguments.texte(nom).map(valeur -> {
            try {
                LocalDate jour = LocalDate.parse(valeur);
                return (fin ? jour.plusDays(1) : jour).atStartOfDay(ZoneOffset.UTC).toInstant();
            } catch (DateTimeParseException e) {
                throw OutilLecture.invalide("« " + nom + " » doit être une date aaaa-MM-jj.");
            }
        }).orElse(null);
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

package staport.rh.mcp.outils;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import staport.rh.audit.services.interfaces.IAuditOutilsAgent;
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

import static staport.rh.mcp.outils.OutilDefini.enumeration;
import static staport.rh.mcp.outils.OutilDefini.identifiant;
import static staport.rh.mcp.outils.OutilDefini.limite;
import static staport.rh.mcp.outils.OutilDefini.liste;
import static staport.rh.mcp.outils.OutilDefini.nombre;
import static staport.rh.mcp.outils.OutilDefini.objetLibre;
import static staport.rh.mcp.outils.OutilDefini.outil;
import static staport.rh.mcp.outils.OutilDefini.texte;

/**
 * Outils des référentiels Chantier, Équipe et Fonction : rechercher (20 au plus) et lire une fiche. Les identifiants
 * rendus servent à filtrer les outils Paie et Employé. Vocabulaire chantier : {@code EN_COURS} / {@code CLOTURE}.
 */
public final class OutilsReferentiels {

    private static final int LIMITE = 20;

    private OutilsReferentiels() {
    }

    public static List<OutilLecture> catalogue(IChantierService chantiers, IEquipeService equipes,
                                               IFunctionService fonctions, IAuditOutilsAgent audit) {
        return List.of(
                chantierRechercher(chantiers, audit),
                outil("chantier_fiche")
                        .description("Fiche d'un chantier par son identifiant : code, désignation, nom, origine ERP, statut.")
                        .permissions("CHANTIER_READ")
                        .entree(Map.of("id", identifiant("Identifiant du chantier")))
                        .sortie(Map.of("chantier", objetLibre(), "vue", OutilLecture.vueProposee()), "chantier", "vue")
                        .execution((lecteur, arguments) -> {
                            ChantierResponseDto c = chantiers.findById(obligatoire(arguments));
                            return fiche("chantier", chantier(c), "chantiers", c.id(), "Chantier " + c.code() + ".");
                        })
                        .construire(audit),
                rechercher("equipe_rechercher", "EQUIPE_READ", "equipes",
                        "Recherche des équipes par code ou libellé (texte partiel) : identifiant, code, libellé.",
                        arguments -> equipes.search(new EquipeSearchCriteria(null, null, arguments.texte("recherche").orElse(null)),
                                page(arguments, "code")),
                        OutilsReferentiels::equipe, audit),
                outil("equipe_fiche")
                        .description("Fiche d'une équipe par son identifiant : code et libellé.")
                        .permissions("EQUIPE_READ")
                        .entree(Map.of("id", identifiant("Identifiant de l'équipe")))
                        .sortie(Map.of("equipe", objetLibre(), "vue", OutilLecture.vueProposee()), "equipe", "vue")
                        .execution((lecteur, arguments) -> {
                            EquipeResponseDto e = equipes.findById(obligatoire(arguments));
                            return fiche("equipe", equipe(e), "equipes", e.id(), "Équipe " + e.code() + ".");
                        })
                        .construire(audit),
                rechercher("fonction_rechercher", "FUNCTION_READ", "functions",
                        "Recherche des fonctions (métiers) par libellé partiel : identifiant et libellé.",
                        arguments -> fonctions.search(new FunctionSearchCriteria(arguments.texte("recherche").orElse(null)),
                                page(arguments, "libelle")),
                        OutilsReferentiels::fonction, audit),
                outil("fonction_fiche")
                        .description("Fiche d'une fonction par son identifiant.")
                        .permissions("FUNCTION_READ")
                        .entree(Map.of("id", identifiant("Identifiant de la fonction")))
                        .sortie(Map.of("fonction", objetLibre(), "vue", OutilLecture.vueProposee()), "fonction", "vue")
                        .execution((lecteur, arguments) -> {
                            FunctionResponseDto f = fonctions.findById(obligatoire(arguments));
                            return fiche("fonction", fonction(f), "functions", f.id(), "Fonction " + f.libelle() + ".");
                        })
                        .construire(audit));
    }

    private static OutilLecture chantierRechercher(IChantierService chantiers, IAuditOutilsAgent audit) {
        return outil("chantier_rechercher")
                .description("Recherche des chantiers par code ou désignation (texte partiel) et/ou statut : identifiant, "
                        + "code, désignation, statut EN_COURS ou CLOTURE. 20 au plus, avec le nombre total.")
                .permissions("CHANTIER_READ")
                .entree(Map.of(
                        "recherche", texte("Code ou désignation, partiel", 100),
                        "statut", enumeration("Absent = tous", "EN_COURS", "CLOTURE"),
                        "limite", limite(10, LIMITE)))
                .sortie(Map.of("total", nombre(), "chantiers", liste(), "vue", OutilLecture.vueProposee()),
                        "total", "chantiers", "vue")
                .execution((lecteur, arguments) -> {
                    String recherche = arguments.texte("recherche").orElse(null);
                    Boolean actif = arguments.texte("statut").map("EN_COURS"::equals).orElse(null);
                    Page<ChantierResponseDto> page = chantiers.search(new ChantierSearchCriteria(null, null, recherche, actif),
                            page(arguments, "code"));
                    Map<String, String> parametres = new LinkedHashMap<>();
                    if (page.getNumberOfElements() == 1) {
                        parametres.put("code", page.getContent().getFirst().code());
                    }
                    if (actif != null) {
                        parametres.put("actif", actif.toString());
                    }
                    return resultatListe("chantiers", page, OutilsReferentiels::chantier,
                            new VueProposeeDto("chantiers", "tabulaire", parametres));
                })
                .construire(audit);
    }

    private static <T> OutilLecture rechercher(String nom, String permission, String module, String description,
                                               Function<Arguments, Page<T>> recherche,
                                               Function<T, Map<String, Object>> enJson, IAuditOutilsAgent audit) {
        String cle = nom.substring(0, nom.indexOf('_')) + "s";
        return outil(nom)
                .description(description + " 20 au plus, avec le nombre total.")
                .permissions(permission)
                .entree(Map.of("recherche", texte("Texte partiel ; absent = tous", 100), "limite", limite(10, LIMITE)))
                .sortie(Map.of("total", nombre(), cle, liste(), "vue", OutilLecture.vueProposee()), "total", cle, "vue")
                .execution((lecteur, arguments) -> {
                    Page<T> page = recherche.apply(arguments);
                    Map<String, String> parametres = new LinkedHashMap<>();
                    arguments.texte("recherche").ifPresent(texte -> parametres.put(module.equals("equipes") ? "code" : "libelle", texte));
                    return resultatListe(cle, page, enJson, new VueProposeeDto(module, "tabulaire", parametres));
                })
                .construire(audit);
    }

    private static <T> OutilLecture.Resultat resultatListe(String cle, Page<T> page, Function<T, Map<String, Object>> enJson,
                                                   VueProposeeDto vue) {
        List<Map<String, Object>> elements = page.getContent().stream().map(enJson).toList();
        Map<String, Object> donnees = new LinkedHashMap<>();
        donnees.put("total", page.getTotalElements());
        donnees.put(cle, elements);
        donnees.put("vue", vue.enJson());
        return new OutilLecture.Resultat(donnees, page.getTotalElements() + " " + cle + " trouvé(s), "
                + elements.size() + " rendu(s).", elements.size(), Map.of());
    }

    private static OutilLecture.Resultat fiche(String cle, Map<String, Object> valeurs, String module, Long id, String synthese) {
        Map<String, Object> donnees = new LinkedHashMap<>();
        donnees.put(cle, valeurs);
        donnees.put("vue", new VueProposeeDto(module, "fiche", Map.of("id", String.valueOf(id))).enJson());
        return new OutilLecture.Resultat(donnees, synthese, 1, Map.of("id", id));
    }

    static PageRequest page(Arguments arguments, String tri) {
        return PageRequest.of(0, arguments.entier("limite", 10, 1, LIMITE), Sort.by(tri));
    }

    static long obligatoire(Arguments arguments) {
        return arguments.identifiant("id").orElseThrow(() -> OutilLecture.invalide("« id » est obligatoire."));
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

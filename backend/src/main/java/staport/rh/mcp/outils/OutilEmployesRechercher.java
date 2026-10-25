package staport.rh.mcp.outils;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.core.Authentication;
import staport.rh.audit.services.interfaces.IAuditOutilsAgent;
import staport.rh.employee.dtos.request.EmployeeSearchCriteria;
import staport.rh.employee.dtos.response.EmployeeResponseDto;
import staport.rh.employee.entities.EmployeeStatut;
import staport.rh.employee.projection.ProjectionPaieEmployee;
import staport.rh.employee.services.interfaces.IEmployeeService;
import staport.rh.mcp.dtos.VueProposeeDto;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * {@code employes_rechercher} : fiches Employé correspondant à un nom et/ou un périmètre, au plus
 * {@value #LIMITE_MAXIMALE}. Minimisation : ni CIN ni date de naissance ; le salaire et son type seulement avec
 * {@code PAIE_READ}, selon la même règle que l'API ({@link ProjectionPaieEmployee}).
 */
public class OutilEmployesRechercher extends OutilLecture {

    static final String NOM = "employes_rechercher";
    static final int LIMITE_MAXIMALE = 20;

    private final IEmployeeService employes;

    public OutilEmployesRechercher(IEmployeeService employes, IAuditOutilsAgent audit) {
        super(audit);
        this.employes = employes;
    }

    @Override
    protected String nom() {
        return NOM;
    }

    @Override
    protected String description() {
        return "Recherche des employés par nom (partiel) et/ou par chantier, équipe, fonction, statut. Renvoie au plus "
                + LIMITE_MAXIMALE + " fiches (fonction, chantier, équipe, statut) et le nombre total trouvé ; le salaire "
                + "n'apparaît que si l'utilisateur a le droit de voir la paie.";
    }

    @Override
    protected Set<String> permissions() {
        return Set.of("EMPLOYEE_READ");
    }

    @Override
    protected Map<String, Object> proprietesEntree() {
        return Map.of(
                "nom", Map.of("type", "string", "minLength", 2, "maxLength", 150, "description", "Nom et/ou prénom, partiel"),
                "chantierIds", identifiants("Chantiers ; absent = tous"),
                "equipeIds", identifiants("Équipes ; 0 = sans équipe ; absent = toutes"),
                "fonctionIds", identifiants("Fonctions ; absent = toutes"),
                "statut", Statuts.schema(),
                "limite", Map.of("type", "integer", "minimum", 1, "maximum", LIMITE_MAXIMALE,
                        "description", "Nombre de fiches rendues, 10 par défaut"));
    }

    @Override
    protected Map<String, Object> schemaSortie() {
        return objet(Map.of(
                "total", Map.of("type", "integer"),
                "employes", Map.of("type", "array", "items", Map.of("type", "object")),
                "salaireVisible", Map.of("type", "boolean"),
                "vue", vueProposee()), List.of("total", "employes", "salaireVisible", "vue"));
    }

    @Override
    protected Resultat executer(Authentication lecteur, Arguments arguments) {
        String nom = arguments.texte("nom").orElse(null);
        List<Long> chantiers = arguments.identifiants("chantierIds");
        List<Long> equipes = arguments.identifiants("equipeIds");
        List<Long> fonctions = arguments.identifiants("fonctionIds");
        EmployeeStatut statut = Statuts.lire(arguments);
        if (nom == null && chantiers == null && equipes == null && fonctions == null && statut == null) {
            throw invalide("Préciser un nom ou un périmètre (chantier, équipe, fonction, statut).");
        }
        int limite = arguments.entier("limite", 10, 1, LIMITE_MAXIMALE);
        boolean voitLaPaie = ProjectionPaieEmployee.voitLaPaie(lecteur);

        Page<EmployeeResponseDto> page = employes.search(
                new EmployeeSearchCriteria(nom, null, fonctions, chantiers, equipes, statut),
                PageRequest.of(0, limite, Sort.by("nomPrenom")));
        List<Map<String, Object>> fiches = page.getContent().stream()
                .map(employe -> fiche(ProjectionPaieEmployee.pourLeLecteur(employe, voitLaPaie), voitLaPaie))
                .toList();

        Map<String, String> parametres = new LinkedHashMap<>(Perimetres.parametresUrl(chantiers, equipes, fonctions));
        if (nom != null) {
            parametres.put("nom", nom);
        }
        Statuts.versUrl(statut, parametres);
        Map<String, Object> donnees = new LinkedHashMap<>();
        donnees.put("total", page.getTotalElements());
        donnees.put("employes", fiches);
        donnees.put("salaireVisible", voitLaPaie);
        donnees.put("vue", new VueProposeeDto("employees", "tabulaire", parametres).enJson());

        Map<String, Object> perimetre = Perimetres.de(null, chantiers, equipes, fonctions);
        perimetre.put("rechercheParNom", nom != null);
        if (statut != null) {
            perimetre.put("statut", statut.name());
        }
        String synthese = page.getTotalElements() + " employé(s) trouvé(s), " + fiches.size() + " affiché(s).";
        return new Resultat(donnees, synthese, fiches.size(), perimetre);
    }

    private static Map<String, Object> fiche(EmployeeResponseDto employe, boolean voitLaPaie) {
        Map<String, Object> fiche = new LinkedHashMap<>();
        fiche.put("id", employe.id());
        fiche.put("nomPrenom", employe.nomPrenom());
        fiche.put("statut", Statuts.libelle(employe.statut()));
        fiche.put("fonction", employe.fonction() == null ? null : employe.fonction().libelle());
        fiche.put("chantier", employe.chantier() == null ? null
                : Map.of("id", employe.chantier().id(), "code", employe.chantier().code()));
        fiche.put("equipe", employe.equipe() == null ? null : employe.equipe().code());
        if (voitLaPaie) {
            fiche.put("salaire", employe.salaire());
            fiche.put("typeSalaire", employe.typeSalaire() == null ? null : employe.typeSalaire().name());
        }
        return fiche;
    }
}

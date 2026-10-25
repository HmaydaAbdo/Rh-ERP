package staport.rh.mcp.outils;

import org.springframework.security.core.Authentication;
import staport.rh.audit.services.interfaces.IAuditOutilsAgent;
import staport.rh.employee.dtos.request.EmployeeSearchCriteria;
import staport.rh.employee.dtos.response.EmployeeAnalytiqueDto;
import staport.rh.employee.entities.EmployeeStatut;
import staport.rh.employee.services.interfaces.IEmployeeAnalytiqueService;
import staport.rh.mcp.dtos.VueProposeeDto;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * {@code employes_compter} : effectif des fiches Employé d'un périmètre (en poste et sortis), âge et ancienneté moyens,
 * embauches des douze derniers mois et tranches. Mêmes chiffres que la vue Analytique des Employés ; aucun salaire.
 */
public class OutilEmployesCompter extends OutilLecture {

    static final String NOM = "employes_compter";

    private final IEmployeeAnalytiqueService analytique;

    public OutilEmployesCompter(IEmployeeAnalytiqueService analytique, IAuditOutilsAgent audit) {
        super(audit);
        this.analytique = analytique;
    }

    @Override
    protected String nom() {
        return NOM;
    }

    @Override
    protected String description() {
        return "Effectif des employés (en poste, sortis) d'un périmètre de chantiers, équipes ou fonctions, âge et "
                + "ancienneté moyens en années, embauches des 12 derniers mois et répartition par tranches. "
                + "État courant des fiches, issu du dernier mois de paie importé.";
    }

    @Override
    protected Set<String> permissions() {
        return Set.of("EMPLOYEE_READ");
    }

    @Override
    protected Map<String, Object> proprietesEntree() {
        return Map.of(
                "chantierIds", identifiants("Chantiers du périmètre ; absent = tous"),
                "equipeIds", identifiants("Équipes du périmètre ; 0 = employés sans équipe ; absent = toutes"),
                "fonctionIds", identifiants("Fonctions du périmètre ; absent = toutes"),
                "statut", Statuts.schema());
    }

    @Override
    protected Map<String, Object> schemaSortie() {
        return objet(Map.of(
                "effectif", Map.of("type", "integer"), "enPoste", Map.of("type", "integer"),
                "sortis", Map.of("type", "integer"), "ageMoyen", Map.of("type", List.of("number", "null")),
                "ancienneteMoyenne", Map.of("type", List.of("number", "null")),
                "embauchesDouzeMois", Map.of("type", "integer"),
                "parAge", Map.of("type", "array"), "parAnciennete", Map.of("type", "array"),
                "vue", vueProposee()), List.of("effectif", "enPoste", "sortis", "vue"));
    }

    @Override
    protected Resultat executer(Authentication lecteur, Arguments arguments) {
        List<Long> chantiers = arguments.identifiants("chantierIds");
        List<Long> equipes = arguments.identifiants("equipeIds");
        List<Long> fonctions = arguments.identifiants("fonctionIds");
        EmployeeStatut statut = Statuts.lire(arguments);
        EmployeeAnalytiqueDto resultat = analytique.analyser(
                new EmployeeSearchCriteria(null, null, fonctions, chantiers, equipes, statut));

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
        Statuts.versUrl(statut, parametres);
        donnees.put("vue", new VueProposeeDto("employees", "analytique", parametres).enJson());

        String synthese = resultat.effectif() + " employés : " + resultat.actifs() + " en poste, "
                + resultat.inactifs() + " sortis.";
        Map<String, Object> perimetre = Perimetres.de(null, chantiers, equipes, fonctions);
        if (statut != null) {
            perimetre.put("statut", statut.name());
        }
        return new Resultat(donnees, synthese, 1, perimetre);
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
}

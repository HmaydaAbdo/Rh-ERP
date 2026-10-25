package staport.rh.mcp.outils;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.core.Authentication;
import staport.rh.audit.services.interfaces.IAuditOutilsAgent;
import staport.rh.chantier.dtos.request.ChantierSearchCriteria;
import staport.rh.chantier.dtos.response.ChantierResponseDto;
import staport.rh.chantier.services.interfaces.IChantierService;
import staport.rh.mcp.dtos.VueProposeeDto;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * {@code chantier_fiche} : chantiers dont le code ou la désignation contient le texte cherché, au plus
 * {@value #RESULTATS}, avec leur identifiant pour filtrer les autres outils. Vocabulaire : « En cours » / « Clôturé ».
 */
public class OutilChantierFiche extends OutilLecture {

    static final String NOM = "chantier_fiche";
    static final int RESULTATS = 5;

    private final IChantierService chantiers;

    public OutilChantierFiche(IChantierService chantiers, IAuditOutilsAgent audit) {
        super(audit);
        this.chantiers = chantiers;
    }

    @Override
    protected String nom() {
        return NOM;
    }

    @Override
    protected String description() {
        return "Retrouve un chantier par son code ou sa désignation (texte partiel) : identifiant, code, désignation et "
                + "statut (EN_COURS ou CLOTURE). L'identifiant sert à filtrer paie_indicateurs et les outils employés.";
    }

    @Override
    protected Set<String> permissions() {
        return Set.of("CHANTIER_READ");
    }

    @Override
    protected Map<String, Object> proprietesEntree() {
        return Map.of("recherche", Map.of("type", "string", "minLength", 1, "maxLength", 100,
                "description", "Code ou désignation, partiel"));
    }

    @Override
    protected Map<String, Object> schemaSortie() {
        return objet(Map.of(
                "total", Map.of("type", "integer"),
                "chantiers", Map.of("type", "array", "items", Map.of("type", "object")),
                "vue", vueProposee()), List.of("total", "chantiers", "vue"));
    }

    @Override
    protected Resultat executer(Authentication lecteur, Arguments arguments) {
        String recherche = arguments.texte("recherche")
                .orElseThrow(() -> invalide("« recherche » est obligatoire : code ou désignation du chantier."));
        Page<ChantierResponseDto> page = chantiers.search(new ChantierSearchCriteria(null, null, recherche, null),
                PageRequest.of(0, RESULTATS, Sort.by("code")));
        List<Map<String, Object>> fiches = page.getContent().stream().map(chantier -> {
            Map<String, Object> fiche = new LinkedHashMap<>();
            fiche.put("id", chantier.id());
            fiche.put("code", chantier.code());
            fiche.put("designation", chantier.designation());
            fiche.put("statut", chantier.actif() ? "EN_COURS" : "CLOTURE");
            return fiche;
        }).toList();

        Map<String, String> parametres = new LinkedHashMap<>();
        if (fiches.size() == 1) {
            parametres.put("code", (String) fiches.getFirst().get("code"));
        }
        Map<String, Object> donnees = new LinkedHashMap<>();
        donnees.put("total", page.getTotalElements());
        donnees.put("chantiers", fiches);
        donnees.put("vue", new VueProposeeDto("chantiers", "tabulaire", parametres).enJson());
        String synthese = page.getTotalElements() + " chantier(s) trouvé(s).";
        return new Resultat(donnees, synthese, fiches.size(), Map.of());
    }
}

package staport.rh.mcp.outils;

import org.springframework.security.core.Authentication;
import staport.rh.audit.services.interfaces.IAuditOutilsAgent;
import staport.rh.mcp.dtos.VueProposeeDto;
import staport.rh.paie.dtos.request.PaieSearchCriteria;
import staport.rh.paie.dtos.response.PaieAnalytiqueDto;
import staport.rh.paie.services.interfaces.IPaieAnalytiqueService;
import staport.rh.paie.services.interfaces.IPaieService;

import java.time.YearMonth;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * {@code paie_indicateurs} : indicateurs de la paie d'un mois sur un périmètre (masse, effectif payé, coût moyen, STC),
 * comparés au mois précédent, et principaux chantiers. Mêmes chiffres que la vue Analytique de la Paie.
 */
public class OutilPaieIndicateurs extends OutilLecture {

    static final String NOM = "paie_indicateurs";
    private static final int CHANTIERS_RENDUS = 5;

    private final IPaieService paie;
    private final IPaieAnalytiqueService analytique;

    public OutilPaieIndicateurs(IPaieService paie, IPaieAnalytiqueService analytique, IAuditOutilsAgent audit) {
        super(audit);
        this.paie = paie;
        this.analytique = analytique;
    }

    @Override
    protected String nom() {
        return NOM;
    }

    @Override
    protected String description() {
        return "Indicateurs de paie d'un mois (masse salariale, effectif payé, coût moyen, soldes de tout compte) sur un "
                + "périmètre de chantiers, équipes ou fonctions, avec le mois précédent et les principaux chantiers. "
                + "Les montants sont en dirhams, calculés par l'ERP.";
    }

    @Override
    protected Set<String> permissions() {
        return Set.of("PAIE_READ");
    }

    @Override
    protected Map<String, Object> proprietesEntree() {
        return Map.of(
                "periode", periode(),
                "chantierIds", identifiants("Chantiers du périmètre ; absent = tous"),
                "equipeIds", identifiants("Équipes du périmètre ; 0 = bulletins sans équipe ; absent = toutes"),
                "fonctionIds", identifiants("Fonctions du périmètre ; absent = toutes"));
    }

    @Override
    protected Map<String, Object> schemaSortie() {
        Map<String, Object> kpi = objet(Map.of(
                "masse", Map.of("type", "number"), "effectif", Map.of("type", "integer"),
                "coutMoyen", Map.of("type", List.of("number", "null")), "nombreChantiers", Map.of("type", "integer"),
                "stc", Map.of("type", "integer"), "stcMontant", Map.of("type", "number")),
                List.of("masse", "effectif", "nombreChantiers", "stc", "stcMontant"));
        Map<String, Object> moisPrecedent = new HashMap<>(kpi);
        moisPrecedent.put("type", List.of("object", "null"));
        return objet(Map.of(
                "periode", Map.of("type", "string"),
                "indicateurs", kpi,
                "moisPrecedent", moisPrecedent,
                "principauxChantiers", Map.of("type", "array", "items", Map.of("type", "object")),
                "vue", vueProposee()), List.of("periode", "indicateurs", "principauxChantiers", "vue"));
    }

    @Override
    protected Resultat executer(Authentication lecteur, Arguments arguments) {
        YearMonth periode = arguments.periode("periode").orElseGet(this::dernierePeriode);
        List<Long> chantiers = arguments.identifiants("chantierIds");
        List<Long> equipes = arguments.identifiants("equipeIds");
        List<Long> fonctions = arguments.identifiants("fonctionIds");
        PaieAnalytiqueDto resultat = analytique.analyser(new PaieSearchCriteria(null, null, periode, fonctions, chantiers, equipes));

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
        donnees.put("periode", periode.toString());
        donnees.put("indicateurs", kpi(resultat.kpis()));
        donnees.put("moisPrecedent", resultat.moisPrecedent() == null ? null : kpi(resultat.moisPrecedent()));
        donnees.put("principauxChantiers", principaux);
        donnees.put("vue", vue(periode, chantiers, equipes, fonctions).enJson());

        PaieAnalytiqueDto.Kpi k = resultat.kpis();
        String synthese = "Paie " + periode + " : masse " + k.masse() + " MAD, " + k.effectif() + " bulletins, "
                + k.nombreChantiers() + " chantiers, " + k.stc() + " STC.";
        return new Resultat(donnees, synthese, 1, Perimetres.de(periode, chantiers, equipes, fonctions));
    }

    private YearMonth dernierePeriode() {
        return paie.findPeriodes(null).stream().findFirst()
                .map(resume -> YearMonth.parse(resume.periode()))
                .orElseThrow(() -> invalide("Aucune paie n'est encore importée."));
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

    private static VueProposeeDto vue(YearMonth periode, List<Long> chantiers, List<Long> equipes, List<Long> fonctions) {
        Map<String, String> parametres = new LinkedHashMap<>(Perimetres.parametresUrl(chantiers, equipes, fonctions));
        parametres.put("periode", periode.toString());
        return new VueProposeeDto("paie", "analytique", parametres);
    }
}

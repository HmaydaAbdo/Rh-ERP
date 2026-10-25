package staport.rh.mcp.outils;

import org.springframework.security.core.Authentication;
import staport.rh.audit.services.interfaces.IAuditOutilsAgent;
import staport.rh.employee.dtos.response.EmployeeSortieDto;
import staport.rh.employee.entities.EmployeeStatut;
import staport.rh.employee.services.interfaces.IEmployeeService;
import staport.rh.mcp.dtos.VueProposeeDto;
import staport.rh.paie.services.interfaces.IPaieService;

import java.time.YearMonth;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;

/**
 * {@code employes_sorties} : départs de l'entreprise constatés par la paie d'un mois (STC ou absence confirmée), leur
 * nombre par motif et, au plus {@value #NOMS_RENDUS}, les personnes concernées.
 */
public class OutilEmployesSorties extends OutilLecture {

    static final String NOM = "employes_sorties";
    static final int NOMS_RENDUS = 20;

    private final IEmployeeService employes;
    private final IPaieService paie;

    public OutilEmployesSorties(IEmployeeService employes, IPaieService paie, IAuditOutilsAgent audit) {
        super(audit);
        this.employes = employes;
        this.paie = paie;
    }

    @Override
    protected String nom() {
        return NOM;
    }

    @Override
    protected String description() {
        return "Départs de l'entreprise enregistrés pour un mois de paie (soldes de tout compte et absences confirmées) : "
                + "nombre total, nombre par motif et, au plus " + NOMS_RENDUS + ", les employés concernés.";
    }

    @Override
    protected Set<String> permissions() {
        return Set.of("EMPLOYEE_READ");
    }

    @Override
    protected Map<String, Object> proprietesEntree() {
        return Map.of("periode", periode());
    }

    @Override
    protected Map<String, Object> schemaSortie() {
        return objet(Map.of(
                "periode", Map.of("type", "string"), "nombre", Map.of("type", "integer"),
                "parMotif", Map.of("type", "object"),
                "employes", Map.of("type", "array", "items", Map.of("type", "object")),
                "vue", vueProposee()), List.of("periode", "nombre", "parMotif", "employes", "vue"));
    }

    @Override
    protected Resultat executer(Authentication lecteur, Arguments arguments) {
        YearMonth periode = arguments.periode("periode").orElseGet(this::dernierePeriode);
        List<EmployeeSortieDto> sorties = employes.listerToutesLesSorties().stream()
                .filter(sortie -> periode.equals(sortie.periode()))
                .toList();
        Map<String, Long> parMotif = sorties.stream()
                .collect(Collectors.groupingBy(OutilEmployesSorties::motif, TreeMap::new, Collectors.counting()));
        List<Map<String, Object>> personnes = sorties.stream().limit(NOMS_RENDUS)
                .map(sortie -> Map.<String, Object>of("id", sortie.employeId(),
                        "nomPrenom", employes.findById(sortie.employeId()).nomPrenom(), "motif", motif(sortie)))
                .toList();

        Map<String, String> parametres = new LinkedHashMap<>();
        Statuts.versUrl(EmployeeStatut.INACTIF, parametres);
        Map<String, Object> donnees = new LinkedHashMap<>();
        donnees.put("periode", periode.toString());
        donnees.put("nombre", sorties.size());
        donnees.put("parMotif", parMotif);
        donnees.put("employes", personnes);
        donnees.put("vue", new VueProposeeDto("employees", "tabulaire", parametres).enJson());
        String synthese = sorties.size() + " départ(s) en " + periode + ".";
        return new Resultat(donnees, synthese, personnes.size(), Perimetres.de(periode, null, null, null));
    }

    /** Un départ ancien sans motif reste compté. */
    private static String motif(EmployeeSortieDto sortie) {
        return sortie.motif() == null || sortie.motif().isBlank() ? "NON_PRECISE" : sortie.motif();
    }

    private YearMonth dernierePeriode() {
        return paie.findPeriodes(null).stream().findFirst()
                .map(resume -> YearMonth.parse(resume.periode()))
                .orElseThrow(() -> invalide("Aucune paie n'est encore importée."));
    }
}

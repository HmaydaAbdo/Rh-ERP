package staport.rh.paie.effectifs;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import staport.rh.employee.dtos.response.EmployeeSortieDto;
import staport.rh.employee.services.interfaces.IEmployeeService;
import staport.rh.paie.repositories.EffectifBulletinProjection;
import staport.rh.paie.repositories.PaieRepository;

import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Tendances des effectifs mois par mois, calculées à partir des bulletins (instantanés du mois) et des départs enregistrés
 * (ADR 0010). Les bulletins sont lus en projection — cinq colonnes, aucune entité — puis comptés en mémoire : les
 * comparaisons d'un mois au précédent ne s'expriment pas en JPQL.
 */
@Service
public class PaieEffectifsService {

    private final PaieRepository repository;
    private final IEmployeeService employeeService;

    public PaieEffectifsService(PaieRepository repository, IEmployeeService employeeService) {
        this.repository = repository;
        this.employeeService = employeeService;
    }

    @Transactional(readOnly = true)
    public List<EffectifMoisDto> tendances(EffectifsCriteria criteres) {
        // Mois -> employé -> chantier du mois, pour les seuls bulletins du périmètre.
        Map<YearMonth, Map<Long, Long>> parMois = new TreeMap<>();
        for (EffectifBulletinProjection bulletin : repository.listerEffectifs()) {
            if (dansLePerimetre(bulletin, criteres)) {
                parMois.computeIfAbsent(bulletin.getPeriode(), m -> new HashMap<>()).put(bulletin.getEmployeId(), bulletin.getChantierId());
            }
        }
        Map<YearMonth, List<Long>> departs = new HashMap<>();
        for (EmployeeSortieDto depart : employeeService.listerToutesLesSorties()) {
            departs.computeIfAbsent(depart.periode(), m -> new ArrayList<>()).add(depart.employeId());
        }

        List<EffectifMoisDto> tendances = new ArrayList<>();
        Map<Long, Long> precedent = null;
        for (Map.Entry<YearMonth, Map<Long, Long>> mois : parMois.entrySet()) {
            Map<Long, Long> courant = mois.getValue();
            Map<Long, Long> moisAvant = parMois.get(mois.getKey().minusMonths(1));
            Map<Long, Long> avant = moisAvant != null ? moisAvant : Map.of();
            // Un départ compte dans le périmètre si l'employé y était payé ce mois-ci ou le mois d'avant.
            long sorties = departs.getOrDefault(mois.getKey(), List.of()).stream()
                    .filter(id -> courant.containsKey(id) || avant.containsKey(id))
                    .count();
            Long entrees = null;
            Long mutations = null;
            if (precedent != null) {
                entrees = courant.keySet().stream().filter(id -> !avant.containsKey(id)).count();
                mutations = courant.entrySet().stream()
                        .filter(e -> avant.containsKey(e.getKey()) && !avant.get(e.getKey()).equals(e.getValue()))
                        .count();
            }
            tendances.add(new EffectifMoisDto(mois.getKey(), courant.size(), entrees, sorties, mutations));
            precedent = courant;
        }
        return tendances;
    }

    private static boolean dansLePerimetre(EffectifBulletinProjection bulletin, EffectifsCriteria criteres) {
        if (criteres == null) {
            return true;
        }
        return contient(criteres.chantierIds(), bulletin.getChantierId())
                && contient(criteres.fonctionIds(), bulletin.getFonctionId())
                && contient(criteres.equipeIds(), bulletin.getEquipeId() == null ? 0L : bulletin.getEquipeId());
    }

    private static boolean contient(List<Long> filtre, Long valeur) {
        return filtre == null || filtre.isEmpty() || filtre.contains(valeur);
    }
}

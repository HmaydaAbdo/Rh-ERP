package staport.rh.employee.services;

import jakarta.persistence.EntityManager;
import jakarta.persistence.Tuple;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.From;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Root;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import staport.rh.employee.dtos.request.EmployeeSearchCriteria;
import staport.rh.employee.dtos.response.EmployeeAnalytiqueDto;
import staport.rh.employee.dtos.response.EmployeeAnalytiqueDto.TrancheDto;
import staport.rh.employee.dtos.response.EmployeeRegroupementDto;
import staport.rh.employee.entities.DimensionEmployes;
import staport.rh.employee.entities.Employee;
import staport.rh.employee.entities.EmployeeStatut;
import staport.rh.employee.services.interfaces.IEmployeeAnalytiqueService;
import staport.rh.employee.specifications.EmployeeSpecification;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.Period;
import java.util.ArrayList;
import java.util.List;

/**
 * Agrégats des employés d'un périmètre (mêmes filtres que la recherche, {@link EmployeeSpecification}). Les regroupements
 * sont comptés par la base ({@code GROUP BY}) ; l'analyse ne lit que trois colonnes par employé (dates et statut) pour
 * calculer âges et anciennetés, qui dépendent du jour.
 */
@Service
public class EmployeeAnalytiqueService implements IEmployeeAnalytiqueService {

    /** Tranches d'âge et d'ancienneté décidées par le propriétaire le 2026-10-19 : bornes basses, en années. */
    private static final int[] TRANCHES_AGE = {0, 25, 35, 45, 55};
    private static final int[] TRANCHES_ANCIENNETE = {0, 1, 3, 5, 10};

    private final EntityManager entityManager;

    public EmployeeAnalytiqueService(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    @Override
    @Transactional(readOnly = true)
    public List<EmployeeRegroupementDto> regrouper(EmployeeSearchCriteria criteria, DimensionEmployes dimension) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        CriteriaQuery<Tuple> requete = cb.createTupleQuery();
        Root<Employee> employe = requete.from(Employee.class);
        From<?, ?> groupe = switch (dimension) {
            case CHANTIER -> employe.join("chantier", JoinType.LEFT);
            case FONCTION -> employe.join("fonction");
            case EQUIPE -> employe.join("equipe", JoinType.LEFT);
        };
        Expression<String> code = groupe.get(dimension == DimensionEmployes.FONCTION ? "libelle" : "code");
        Expression<String> libelle = groupe.get(switch (dimension) {
            case CHANTIER -> "designation";
            case EQUIPE, FONCTION -> "libelle";
        });
        Expression<Long> effectif = cb.count(employe);
        Expression<Integer> actifs = cb.sum(cb.<Integer>selectCase().when(cb.equal(employe.get("statut"), EmployeeStatut.ACTIF), 1).otherwise(0));
        requete.multiselect(groupe.get("id"), code, libelle, effectif, actifs)
                .where(EmployeeSpecification.searchByCriteria(criteria).toPredicate(employe, requete, cb))
                .groupBy(groupe.get("id"), code, libelle)
                .orderBy(cb.desc(effectif), cb.asc(code));

        return entityManager.createQuery(requete).getResultList().stream()
                .map(ligne -> {
                    Long id = ligne.get(0, Long.class);
                    Number nombreActifs = ligne.get(4, Number.class);
                    return id == null
                            ? new EmployeeRegroupementDto(0L, null,
                                    dimension == DimensionEmployes.CHANTIER ? "Sans chantier" : "Sans équipe",
                                    ligne.get(3, Long.class), nombreActifs.longValue())
                            : new EmployeeRegroupementDto(id, ligne.get(1, String.class), ligne.get(2, String.class), ligne.get(3, Long.class),
                                    nombreActifs.longValue());
                })
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public EmployeeAnalytiqueDto analyser(EmployeeSearchCriteria criteria) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        CriteriaQuery<Tuple> requete = cb.createTupleQuery();
        Root<Employee> employe = requete.from(Employee.class);
        requete.multiselect(employe.get("dateNaissance"), employe.get("dateEmbauche"), employe.get("statut"))
                .where(EmployeeSpecification.searchByCriteria(criteria).toPredicate(employe, requete, cb));
        List<Tuple> lignes = entityManager.createQuery(requete).getResultList();

        LocalDate aujourdhui = LocalDate.now();
        long[] parAge = new long[TRANCHES_AGE.length];
        long[] parAnciennete = new long[TRANCHES_ANCIENNETE.length];
        long joursAge = 0;
        long joursAnciennete = 0;
        long actifs = 0;
        long embauches = 0;
        for (Tuple ligne : lignes) {
            LocalDate naissance = ligne.get(0, LocalDate.class);
            LocalDate embauche = ligne.get(1, LocalDate.class);
            parAge[tranche(TRANCHES_AGE, Period.between(naissance, aujourdhui).getYears())]++;
            parAnciennete[tranche(TRANCHES_ANCIENNETE, Math.max(0, Period.between(embauche, aujourdhui).getYears()))]++;
            joursAge += aujourdhui.toEpochDay() - naissance.toEpochDay();
            joursAnciennete += Math.max(0, aujourdhui.toEpochDay() - embauche.toEpochDay());
            if (ligne.get(2) == EmployeeStatut.ACTIF) {
                actifs++;
            }
            if (embauche.isAfter(aujourdhui.minusYears(1))) {
                embauches++;
            }
        }
        long effectif = lignes.size();
        return new EmployeeAnalytiqueDto(effectif, actifs, effectif - actifs, annees(joursAge, effectif), annees(joursAnciennete, effectif),
                embauches, tranches(TRANCHES_AGE, parAge), tranches(TRANCHES_ANCIENNETE, parAnciennete));
    }

    private static int tranche(int[] bornes, int valeur) {
        int indice = 0;
        while (indice + 1 < bornes.length && valeur >= bornes[indice + 1]) {
            indice++;
        }
        return indice;
    }

    private static List<TrancheDto> tranches(int[] bornes, long[] effectifs) {
        List<TrancheDto> tranches = new ArrayList<>();
        for (int i = 0; i < bornes.length; i++) {
            tranches.add(new TrancheDto(bornes[i], i + 1 < bornes.length ? bornes[i + 1] : null, effectifs[i]));
        }
        return tranches;
    }

    /** Moyenne de jours convertie en années, à une décimale ; {@code null} sans employé. */
    private static BigDecimal annees(long totalJours, long effectif) {
        if (effectif == 0) {
            return null;
        }
        return BigDecimal.valueOf(totalJours).divide(BigDecimal.valueOf(effectif * 365.2425), 1, RoundingMode.HALF_UP);
    }
}

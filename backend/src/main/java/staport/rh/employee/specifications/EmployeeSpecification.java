package staport.rh.employee.specifications;

import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;
import staport.rh.common.recherche.MotifRecherche;
import staport.rh.employee.dtos.request.EmployeeSearchCriteria;
import staport.rh.employee.entities.Employee;

import java.util.ArrayList;
import java.util.List;

public class EmployeeSpecification {

    private EmployeeSpecification() {
    }

    public static Specification<Employee> searchByCriteria(EmployeeSearchCriteria criteria) {
        return (root, query, criteriaBuilder) -> {
            if (criteria == null) {
                return criteriaBuilder.conjunction();
            }

            List<Predicate> predicates = new ArrayList<>();

            if (criteria.nomPrenom() != null && !criteria.nomPrenom().isBlank()) {
                predicates.add(criteriaBuilder.like(
                        criteriaBuilder.lower(root.get("nomPrenom")),
                        MotifRecherche.contient(criteria.nomPrenom()),
                        MotifRecherche.ECHAPPEMENT
                ));
            }

            if (criteria.cin() != null && !criteria.cin().isBlank()) {
                predicates.add(criteriaBuilder.like(
                        criteriaBuilder.lower(root.get("cin")),
                        MotifRecherche.contient(criteria.cin()),
                        MotifRecherche.ECHAPPEMENT
                ));
            }

            if (criteria.fonctionIds() != null && !criteria.fonctionIds().isEmpty()) {
                predicates.add(root.get("fonction").get("id").in(criteria.fonctionIds()));
            }

            if (criteria.chantierIds() != null && !criteria.chantierIds().isEmpty()) {
                // 0 = sans chantier : les fiches inactives ont une affectation courante vide.
                var chantier = root.join("chantier", JoinType.LEFT);
                List<Long> ids = criteria.chantierIds().stream().filter(id -> id != 0).toList();
                List<Predicate> chantiers = new ArrayList<>();
                if (criteria.chantierIds().contains(0L)) {
                    chantiers.add(criteriaBuilder.isNull(chantier.get("id")));
                }
                if (!ids.isEmpty()) {
                    chantiers.add(chantier.get("id").in(ids));
                }
                predicates.add(criteriaBuilder.or(chantiers.toArray(new Predicate[0])));
            }

            if (criteria.equipeIds() != null && !criteria.equipeIds().isEmpty()) {
                // 0 = sans équipe : jointure externe pour garder les employés sans équipe
                var equipe = root.join("equipe", JoinType.LEFT);
                List<Long> ids = criteria.equipeIds().stream().filter(id -> id != 0).toList();
                List<Predicate> equipes = new ArrayList<>();
                if (criteria.equipeIds().contains(0L)) {
                    equipes.add(criteriaBuilder.isNull(equipe.get("id")));
                }
                if (!ids.isEmpty()) {
                    equipes.add(equipe.get("id").in(ids));
                }
                predicates.add(criteriaBuilder.or(equipes.toArray(new Predicate[0])));
            }

            if (criteria.statut() != null) {
                predicates.add(criteriaBuilder.equal(root.get("statut"), criteria.statut()));
            }

            return criteriaBuilder.and(predicates.toArray(new Predicate[0]));
        };
    }
}

package staport.rh.employee.specifications;

import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;
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
                        "%" + criteria.nomPrenom().toLowerCase() + "%"
                ));
            }

            if (criteria.cin() != null && !criteria.cin().isBlank()) {
                predicates.add(criteriaBuilder.like(
                        criteriaBuilder.lower(root.get("cin")),
                        "%" + criteria.cin().toLowerCase() + "%"
                ));
            }

            if (criteria.fonctionIds() != null && !criteria.fonctionIds().isEmpty()) {
                predicates.add(root.get("fonction").get("id").in(criteria.fonctionIds()));
            }

            if (criteria.chantierIds() != null && !criteria.chantierIds().isEmpty()) {
                predicates.add(root.get("chantier").get("id").in(criteria.chantierIds()));
            }

            if (criteria.statut() != null) {
                predicates.add(criteriaBuilder.equal(root.get("statut"), criteria.statut()));
            }

            return criteriaBuilder.and(predicates.toArray(new Predicate[0]));
        };
    }
}

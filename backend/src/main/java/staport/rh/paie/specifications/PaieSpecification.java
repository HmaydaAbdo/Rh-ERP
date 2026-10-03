package staport.rh.paie.specifications;

import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;
import staport.rh.employee.entities.Employee;
import staport.rh.paie.dtos.request.PaieSearchCriteria;
import staport.rh.paie.entities.Paie;

import java.util.ArrayList;
import java.util.List;

public class PaieSpecification {

    private PaieSpecification() {
    }

    public static Specification<Paie> searchByCriteria(PaieSearchCriteria criteria) {
        return (root, query, criteriaBuilder) -> {
            if (criteria == null) {
                return criteriaBuilder.conjunction();
            }

            List<Predicate> predicates = new ArrayList<>();

            if (criteria.cin() != null && !criteria.cin().isBlank()) {
                Join<Paie, Employee> employee = root.join("employee");
                predicates.add(criteriaBuilder.like(
                        criteriaBuilder.lower(employee.get("cin")),
                        "%" + criteria.cin().toLowerCase() + "%"
                ));
            }

            if (criteria.nomPrenom() != null && !criteria.nomPrenom().isBlank()) {
                Join<Paie, Employee> employee = root.join("employee");
                predicates.add(criteriaBuilder.like(
                        criteriaBuilder.lower(employee.get("nomPrenom")),
                        "%" + criteria.nomPrenom().toLowerCase() + "%"
                ));
            }

            if (criteria.periode() != null) {
                predicates.add(criteriaBuilder.equal(root.get("periode"), criteria.periode()));
            }

            if (criteria.fonctionIds() != null && !criteria.fonctionIds().isEmpty()) {
                predicates.add(root.get("fonction").get("id").in(criteria.fonctionIds()));
            }

            if (criteria.chantierIds() != null && !criteria.chantierIds().isEmpty()) {
                predicates.add(root.get("chantier").get("id").in(criteria.chantierIds()));
            }

            if (criteria.equipeIds() != null && !criteria.equipeIds().isEmpty()) {
                predicates.add(root.get("equipe").get("id").in(criteria.equipeIds()));
            }

            return criteriaBuilder.and(predicates.toArray(new Predicate[0]));
        };
    }
}

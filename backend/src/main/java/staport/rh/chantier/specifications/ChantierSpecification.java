package staport.rh.chantier.specifications;

import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;
import staport.rh.chantier.dtos.request.ChantierSearchCriteria;
import staport.rh.chantier.entities.Chantier;

import java.util.ArrayList;
import java.util.List;

public class ChantierSpecification {

    private ChantierSpecification() {
    }

    public static Specification<Chantier> searchByCriteria(ChantierSearchCriteria criteria) {
        return (root, query, criteriaBuilder) -> {
            if (criteria == null) {
                return criteriaBuilder.conjunction();
            }

            List<Predicate> predicates = new ArrayList<>();

            if (criteria.code() != null && !criteria.code().isBlank()) {
                predicates.add(criteriaBuilder.like(
                        criteriaBuilder.lower(root.get("code")),
                        "%" + criteria.code().toLowerCase() + "%"
                ));
            }

            if (criteria.designation() != null && !criteria.designation().isBlank()) {
                predicates.add(criteriaBuilder.like(
                        criteriaBuilder.lower(root.get("designation")),
                        "%" + criteria.designation().toLowerCase() + "%"
                ));
            }

            if (criteria.actif() != null) {
                predicates.add(criteriaBuilder.equal(root.get("actif"), criteria.actif()));
            }

            return criteriaBuilder.and(predicates.toArray(new Predicate[0]));
        };
    }
}

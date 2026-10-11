package staport.rh.auth.specifications;

import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;
import staport.rh.auth.dtos.request.RoleSearchCriteria;
import staport.rh.auth.entities.Role;
import staport.rh.common.recherche.MotifRecherche;

import java.util.ArrayList;
import java.util.List;

public class RoleSpecification {

    private RoleSpecification() {
    }

    public static Specification<Role> searchByCriteria(RoleSearchCriteria criteria) {
        return (root, query, criteriaBuilder) -> {
            if (criteria == null) {
                return criteriaBuilder.conjunction();
            }

            List<Predicate> predicates = new ArrayList<>();

            if (criteria.nom() != null && !criteria.nom().isBlank()) {
                predicates.add(criteriaBuilder.like(criteriaBuilder.lower(root.get("nom")),
                        MotifRecherche.contient(criteria.nom()), MotifRecherche.ECHAPPEMENT));
            }
            if (criteria.description() != null && !criteria.description().isBlank()) {
                predicates.add(criteriaBuilder.like(criteriaBuilder.lower(root.get("description")),
                        MotifRecherche.contient(criteria.description()), MotifRecherche.ECHAPPEMENT));
            }

            return criteriaBuilder.and(predicates.toArray(new Predicate[0]));
        };
    }
}

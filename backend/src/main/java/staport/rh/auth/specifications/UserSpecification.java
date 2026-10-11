package staport.rh.auth.specifications;

import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;
import staport.rh.auth.dtos.request.UserSearchCriteria;
import staport.rh.auth.entities.Utilisateur;
import staport.rh.common.recherche.MotifRecherche;

import java.util.ArrayList;
import java.util.List;

public class UserSpecification {

    private UserSpecification() {
    }

    public static Specification<Utilisateur> searchByCriteria(UserSearchCriteria criteria) {
        return (root, query, criteriaBuilder) -> {
            if (criteria == null) {
                return criteriaBuilder.conjunction();
            }

            List<Predicate> predicates = new ArrayList<>();

            if (criteria.username() != null && !criteria.username().isBlank()) {
                predicates.add(criteriaBuilder.like(criteriaBuilder.lower(root.get("username")),
                        MotifRecherche.contient(criteria.username()), MotifRecherche.ECHAPPEMENT));
            }
            if (criteria.email() != null && !criteria.email().isBlank()) {
                predicates.add(criteriaBuilder.like(criteriaBuilder.lower(root.get("email")),
                        MotifRecherche.contient(criteria.email()), MotifRecherche.ECHAPPEMENT));
            }
            if (criteria.actif() != null) {
                predicates.add(criteriaBuilder.equal(root.get("actif"), criteria.actif()));
            }

            return criteriaBuilder.and(predicates.toArray(new Predicate[0]));
        };
    }
}

package staport.rh.function.specifications;

import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;
import staport.rh.common.recherche.MotifRecherche;
import staport.rh.function.dtos.request.FunctionSearchCriteria;
import staport.rh.function.entities.Function;

import java.util.ArrayList;
import java.util.List;

public class FunctionSpecification {

    private FunctionSpecification() {
    }

    public static Specification<Function> searchByCriteria(FunctionSearchCriteria criteria) {
        return (root, query, criteriaBuilder) -> {
            if (criteria == null) {
                return criteriaBuilder.conjunction();
            }

            List<Predicate> predicates = new ArrayList<>();

            if (criteria.libelle() != null && !criteria.libelle().isBlank()) {
                predicates.add(criteriaBuilder.like(
                        criteriaBuilder.lower(root.get("libelle")),
                        MotifRecherche.contient(criteria.libelle()),
                        MotifRecherche.ECHAPPEMENT
                ));
            }

            return criteriaBuilder.and(predicates.toArray(new Predicate[0]));
        };
    }
}

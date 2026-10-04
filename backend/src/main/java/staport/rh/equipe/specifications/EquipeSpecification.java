package staport.rh.equipe.specifications;

import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;
import staport.rh.common.recherche.MotifRecherche;
import staport.rh.equipe.dtos.request.EquipeSearchCriteria;
import staport.rh.equipe.entities.Equipe;

import java.util.ArrayList;
import java.util.List;

public class EquipeSpecification {

    private EquipeSpecification() {
    }

    public static Specification<Equipe> searchByCriteria(EquipeSearchCriteria criteria) {
        return (root, query, criteriaBuilder) -> {
            if (criteria == null) {
                return criteriaBuilder.conjunction();
            }

            List<Predicate> predicates = new ArrayList<>();

            if (criteria.code() != null && !criteria.code().isBlank()) {
                predicates.add(criteriaBuilder.like(
                        criteriaBuilder.lower(root.get("code")),
                        MotifRecherche.contient(criteria.code()),
                        MotifRecherche.ECHAPPEMENT
                ));
            }

            if (criteria.libelle() != null && !criteria.libelle().isBlank()) {
                predicates.add(criteriaBuilder.like(
                        criteriaBuilder.lower(root.get("libelle")),
                        MotifRecherche.contient(criteria.libelle()),
                        MotifRecherche.ECHAPPEMENT
                ));
            }

            if (criteria.recherche() != null && !criteria.recherche().isBlank()) {
                String motif = MotifRecherche.contient(criteria.recherche());
                predicates.add(criteriaBuilder.or(
                        criteriaBuilder.like(criteriaBuilder.lower(root.get("code")), motif, MotifRecherche.ECHAPPEMENT),
                        criteriaBuilder.like(criteriaBuilder.lower(root.get("libelle")), motif, MotifRecherche.ECHAPPEMENT)
                ));
            }

            return criteriaBuilder.and(predicates.toArray(new Predicate[0]));
        };
    }
}

package staport.rh.chantier.specifications;

import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;
import staport.rh.chantier.dtos.request.ChantierSearchCriteria;
import staport.rh.chantier.entities.Chantier;
import staport.rh.common.recherche.MotifRecherche;

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
                        MotifRecherche.contient(criteria.code()),
                        MotifRecherche.ECHAPPEMENT
                ));
            }

            if (criteria.designation() != null && !criteria.designation().isBlank()) {
                predicates.add(criteriaBuilder.like(
                        criteriaBuilder.lower(root.get("designation")),
                        MotifRecherche.contient(criteria.designation()),
                        MotifRecherche.ECHAPPEMENT
                ));
            }

            // Recherche libre du sélecteur générique (voir ChantierReferenceService) : OU entre code
            // et désignation, jamais ET — contrairement à code/designation ci-dessus (filtre précis de
            // la liste chantier, où les 2 champs sont volontairement combinés en ET). Un utilisateur du
            // sélecteur tape ce qu'il voit (le code, affiché comme option), une correspondance sur la
            // seule désignation ne le trouverait jamais.
            if (criteria.recherche() != null && !criteria.recherche().isBlank()) {
                String motif = MotifRecherche.contient(criteria.recherche());
                predicates.add(criteriaBuilder.or(
                        criteriaBuilder.like(criteriaBuilder.lower(root.get("code")), motif, MotifRecherche.ECHAPPEMENT),
                        criteriaBuilder.like(criteriaBuilder.lower(root.get("designation")), motif, MotifRecherche.ECHAPPEMENT)
                ));
            }

            if (criteria.actif() != null) {
                predicates.add(criteriaBuilder.equal(root.get("actif"), criteria.actif()));
            }

            return criteriaBuilder.and(predicates.toArray(new Predicate[0]));
        };
    }
}

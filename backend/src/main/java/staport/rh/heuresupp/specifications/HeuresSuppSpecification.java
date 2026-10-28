package staport.rh.heuresupp.specifications;

import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;
import staport.rh.common.recherche.MotifRecherche;
import staport.rh.employee.entities.Employee;
import staport.rh.heuresupp.dtos.request.HeuresSuppSearchCriteria;
import staport.rh.heuresupp.entities.HeureSupp;

import java.util.ArrayList;
import java.util.List;

public final class HeuresSuppSpecification {

    private HeuresSuppSpecification() {
    }

    public static Specification<HeureSupp> rechercher(HeuresSuppSearchCriteria criteres) {
        return (root, query, cb) -> {
            if (criteres == null) {
                return cb.conjunction();
            }
            List<Predicate> predicates = new ArrayList<>();
            if (criteres.periode() != null) {
                predicates.add(cb.equal(root.get("periode"), criteres.periode()));
            }
            if (criteres.chantierIds() != null && !criteres.chantierIds().isEmpty()) {
                predicates.add(root.get("chantier").get("id").in(criteres.chantierIds()));
            }
            if (criteres.equipeIds() != null && !criteres.equipeIds().isEmpty()) {
                Join<HeureSupp, staport.rh.paie.entities.Paie> bulletin = root.join("paie");
                if (criteres.equipeIds().contains(0L)) {
                    List<Long> ids = criteres.equipeIds().stream().filter(id -> id > 0).toList();
                    predicates.add(ids.isEmpty() ? cb.isNull(bulletin.get("equipe"))
                            : cb.or(bulletin.get("equipe").get("id").in(ids), cb.isNull(bulletin.get("equipe"))));
                } else {
                    predicates.add(bulletin.get("equipe").get("id").in(criteres.equipeIds()));
                }
            }
            if (criteres.fonctionIds() != null && !criteres.fonctionIds().isEmpty()) {
                predicates.add(root.get("fonction").get("id").in(criteres.fonctionIds()));
            }
            if (criteres.cin() != null && !criteres.cin().isBlank()) {
                Join<HeureSupp, Employee> employee = root.join("employee");
                predicates.add(cb.like(cb.lower(employee.get("cin")), MotifRecherche.contient(criteres.cin()), MotifRecherche.ECHAPPEMENT));
            }
            if (criteres.nomPrenom() != null && !criteres.nomPrenom().isBlank()) {
                Join<HeureSupp, Employee> employee = root.join("employee");
                predicates.add(cb.like(cb.lower(employee.get("nomPrenom")), MotifRecherche.contient(criteres.nomPrenom()), MotifRecherche.ECHAPPEMENT));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }
}

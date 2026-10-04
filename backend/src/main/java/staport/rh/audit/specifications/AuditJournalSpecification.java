package staport.rh.audit.specifications;

import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;
import staport.rh.audit.dtos.request.AuditSearchCriteria;
import staport.rh.audit.entities.AuditJournalEntry;
import staport.rh.common.recherche.MotifRecherche;

import java.util.ArrayList;
import java.util.List;

public final class AuditJournalSpecification {

    private AuditJournalSpecification() {
    }

    public static Specification<AuditJournalEntry> searchByCriteria(AuditSearchCriteria criteria) {
        return (root, query, builder) -> {
            if (criteria == null) {
                return builder.conjunction();
            }
            List<Predicate> predicates = new ArrayList<>();
            if (criteria.dateDebut() != null) {
                predicates.add(builder.greaterThanOrEqualTo(root.get("horodatage"), criteria.dateDebut()));
            }
            if (criteria.dateFin() != null) {
                predicates.add(builder.lessThanOrEqualTo(root.get("horodatage"), criteria.dateFin()));
            }
            if (criteria.utilisateur() != null && !criteria.utilisateur().isBlank()) {
                predicates.add(builder.like(builder.lower(root.get("utilisateurNom")),
                        MotifRecherche.contient(criteria.utilisateur().trim()), MotifRecherche.ECHAPPEMENT));
            }
            if (criteria.categorie() != null) {
                predicates.add(builder.equal(root.get("categorie"), criteria.categorie()));
            }
            if (criteria.action() != null && !criteria.action().isBlank()) {
                predicates.add(builder.equal(root.get("action"), criteria.action().trim()));
            }
            if (criteria.resultat() != null) {
                predicates.add(builder.equal(root.get("resultat"), criteria.resultat()));
            }
            if (criteria.entiteType() != null && !criteria.entiteType().isBlank()) {
                predicates.add(builder.equal(root.get("entiteType"), criteria.entiteType().trim()));
            }
            if (criteria.entiteId() != null) {
                predicates.add(builder.equal(root.get("entiteId"), criteria.entiteId()));
            }
            if (criteria.requestId() != null && !criteria.requestId().isBlank()) {
                predicates.add(builder.equal(root.get("requestId"), criteria.requestId().trim()));
            }
            return builder.and(predicates.toArray(new Predicate[0]));
        };
    }
}

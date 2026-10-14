package staport.rh.audit.specifications;

import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;
import staport.rh.audit.dtos.request.AuditSearchCriteria;
import staport.rh.audit.entities.AuditJournalEntry;
import staport.rh.audit.entities.CategorieAudit;
import staport.rh.common.recherche.MotifRecherche;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

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
            Set<CategorieAudit> categories = new LinkedHashSet<>(criteria.categories() == null ? List.of() : criteria.categories());
            if (criteria.categorie() != null) {
                categories.add(criteria.categorie());
            }
            if (!categories.isEmpty()) {
                predicates.add(root.get("categorie").in(categories));
            }
            Set<String> actions = valeursTextuelles(criteria.actions(), criteria.action());
            if (!actions.isEmpty()) {
                predicates.add(root.get("action").in(actions));
            }
            if (criteria.resultat() != null) {
                predicates.add(builder.equal(root.get("resultat"), criteria.resultat()));
            }
            Set<String> entiteTypes = valeursTextuelles(criteria.entiteTypes(), criteria.entiteType());
            if (!entiteTypes.isEmpty()) {
                predicates.add(root.get("entiteType").in(entiteTypes));
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

    private static Set<String> valeursTextuelles(List<String> valeurs, String valeurSinguliere) {
        Set<String> normalisees = new LinkedHashSet<>();
        if (valeurs != null) {
            valeurs.stream()
                    .filter(valeur -> valeur != null && !valeur.isBlank())
                    .map(String::trim)
                    .forEach(normalisees::add);
        }
        if (valeurSinguliere != null && !valeurSinguliere.isBlank()) {
            normalisees.add(valeurSinguliere.trim());
        }
        return normalisees;
    }
}

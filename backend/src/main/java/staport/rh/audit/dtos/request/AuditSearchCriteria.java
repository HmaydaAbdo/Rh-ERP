package staport.rh.audit.dtos.request;

import jakarta.validation.constraints.Size;
import staport.rh.audit.entities.CategorieAudit;
import staport.rh.audit.entities.ResultatAudit;

import java.time.Instant;

/**
 * Filtres de recherche du journal d'audit. {@code utilisateur} : texte « contient » sur l'identifiant de connexion figé
 * dans l'entrée ; {@code entiteType} : nom de l'entité ciblée (ex. {@code Paie}) ; {@code requestId} : toutes les entrées
 * d'une même requête. Tout champ {@code null} ou vide est ignoré.
 */
public record AuditSearchCriteria(
        Instant dateDebut,
        Instant dateFin,
        @Size(max = 100) String utilisateur,
        CategorieAudit categorie,
        @Size(max = 100) String action,
        ResultatAudit resultat,
        @Size(max = 100) String entiteType,
        Long entiteId,
        @Size(max = 100) String requestId
) {
}

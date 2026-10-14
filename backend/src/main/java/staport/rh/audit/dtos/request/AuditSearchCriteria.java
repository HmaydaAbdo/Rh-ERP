package staport.rh.audit.dtos.request;

import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import staport.rh.audit.entities.CategorieAudit;
import staport.rh.audit.entities.ResultatAudit;

import java.time.Instant;
import java.util.List;

/**
 * Filtres de recherche du journal d'audit. {@code utilisateur} : texte « contient » sur l'identifiant de connexion figé
 * dans l'entrée ; {@code entiteType} : nom de l'entité ciblée (ex. {@code Paie}) ; {@code requestId} : toutes les entrées
 * d'une même requête. Les champs pluriels filtrent par inclusion ; les anciens champs singuliers restent acceptés.
 * Tout champ {@code null} ou vide est ignoré.
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
        @Size(max = 100) String requestId,
        @Size(max = 500) List<@NotNull CategorieAudit> categories,
        @Size(max = 500) List<@NotBlank @Size(max = 100) String> actions,
        @Size(max = 500) List<@NotBlank @Size(max = 100) String> entiteTypes
) {
}

package staport.rh.audit.dtos.response;

import staport.rh.audit.context.Origine;
import staport.rh.audit.entities.CategorieAudit;
import staport.rh.audit.entities.ResultatAudit;
import staport.rh.audit.entities.TypeOperation;

import java.time.Instant;
import java.util.Map;

/** Une entrée du journal, avec son contexte complet et son périmètre ; les modifications se lisent à part (« /details »). */
public record AuditJournalDto(
        Long id,
        Instant horodatage,
        CategorieAudit categorie,
        String action,
        TypeOperation typeOperation,
        ResultatAudit resultat,
        Long utilisateurId,
        String utilisateurNom,
        Origine origine,
        String requestId,
        String adresseIp,
        String userAgent,
        String entiteType,
        Long entiteId,
        Integer nombreElements,
        Map<String, Object> perimetre,
        String motif,
        Long revisionId
) {
}

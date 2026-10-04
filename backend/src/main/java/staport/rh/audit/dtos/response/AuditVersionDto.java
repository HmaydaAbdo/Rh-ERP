package staport.rh.audit.dtos.response;

import staport.rh.audit.context.Origine;

import java.time.Instant;
import java.util.List;

/** Une version d'un enregistrement (historique) : qui, quand, d'où, et ce qui a changé par rapport à la version précédente. */
public record AuditVersionDto(
        Long revision,
        Instant horodatage,
        Long utilisateurId,
        String utilisateurNom,
        Origine origine,
        String requestId,
        String operation,
        List<AuditChampDto> champs
) {
}

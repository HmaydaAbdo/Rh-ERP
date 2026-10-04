package staport.rh.audit.dtos.response;

import java.util.List;

/** Ce qu'une révision a fait à un enregistrement : ajout, modification ou suppression, champ par champ. */
public record AuditChangementDto(
        String entiteType,
        Long entiteId,
        String libelle,
        String operation,
        List<AuditChampDto> champs
) {
}

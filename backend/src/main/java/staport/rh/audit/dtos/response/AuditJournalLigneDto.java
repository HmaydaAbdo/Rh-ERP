package staport.rh.audit.dtos.response;

import staport.rh.audit.context.Origine;
import staport.rh.audit.entities.CategorieAudit;
import staport.rh.audit.entities.ResultatAudit;
import staport.rh.audit.entities.TypeOperation;

import java.time.Instant;

/** Une ligne de la liste du journal. Le périmètre et le détail des modifications n'y figurent jamais (lecture à l'ouverture d'une entrée). */
public record AuditJournalLigneDto(
        Long id,
        Instant horodatage,
        CategorieAudit categorie,
        String action,
        TypeOperation typeOperation,
        ResultatAudit resultat,
        Long utilisateurId,
        String utilisateurNom,
        Origine origine,
        String entiteType,
        Long entiteId,
        Integer nombreElements,
        String motif
) {
}

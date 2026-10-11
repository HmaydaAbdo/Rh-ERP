package staport.rh.audit.services.interfaces;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import staport.rh.audit.dtos.request.AuditSearchCriteria;
import staport.rh.audit.dtos.response.AuditChangementDto;
import staport.rh.audit.dtos.response.AuditJournalDto;
import staport.rh.audit.dtos.response.AuditJournalLigneDto;
import staport.rh.audit.dtos.response.AuditVersionDto;
import staport.rh.audit.dtos.response.PaieRestaurationInstantane;

import java.util.List;

/** Façade de consultation du journal d'audit — lecture seule : aucune méthode ne modifie ni ne supprime une entrée. */
public interface IAuditJournalService {

    Page<AuditJournalLigneDto> search(AuditSearchCriteria criteria, Pageable pageable);

    AuditJournalDto findById(Long id);

    /** Ce que l'opération de cette entrée a changé, champ par champ, paginé. Vide si elle n'a rien modifié ou a échoué. */
    Page<AuditChangementDto> details(Long id, Pageable pageable);

    /** Toutes les versions d'un enregistrement ({@code entite} : nom d'une entité auditée, ex. {@code paie}). */
    Page<AuditVersionDto> historique(String entite, Long id, Pageable pageable);

    /** Instantanés des bulletins supprimés par une suppression en groupe réussie, destinés au domaine Paie. */
    List<PaieRestaurationInstantane> instantanesPaiePourRestauration(Long idEntree);
}

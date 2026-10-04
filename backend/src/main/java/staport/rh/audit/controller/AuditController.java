package staport.rh.audit.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import staport.rh.audit.dtos.request.AuditSearchCriteria;
import staport.rh.audit.dtos.response.AuditChangementDto;
import staport.rh.audit.dtos.response.AuditJournalDto;
import staport.rh.audit.dtos.response.AuditJournalLigneDto;
import staport.rh.audit.dtos.response.AuditVersionDto;
import staport.rh.audit.services.interfaces.IAuditJournalService;

/**
 * Consultation du journal d'audit — lecture seule, réservée à {@code AUDIT_READ} : l'audit contient des données
 * personnelles et des montants. Aucune route de modification ni de suppression (conventions/audit.md).
 */
@RestController
@RequestMapping("/logs")
@Tag(name = "Audit", description = "Journal d'audit et historique des enregistrements (lecture seule)")
public class AuditController {

    private final IAuditJournalService journalService;

    public AuditController(IAuditJournalService journalService) {
        this.journalService = journalService;
    }

    @PostMapping("/search")
    @Operation(summary = "Rechercher dans le journal d'audit (dates, utilisateur, catégorie, action, résultat, entité)")
    @PreAuthorize("hasAuthority('AUDIT_READ')")
    public ResponseEntity<Page<AuditJournalLigneDto>> rechercher(@RequestBody(required = false) AuditSearchCriteria criteria,
                                                                 Pageable pageable) {
        return ResponseEntity.ok(journalService.search(criteria, pageable));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Consulter une entrée du journal, avec son contexte et son périmètre")
    @ApiResponse(responseCode = "404")
    @PreAuthorize("hasAuthority('AUDIT_READ')")
    public ResponseEntity<AuditJournalDto> lireParId(@PathVariable Long id) {
        return ResponseEntity.ok(journalService.findById(id));
    }

    @GetMapping("/{id}/details")
    @Operation(summary = "Ce que l'opération d'une entrée a changé, champ par champ (paginé)")
    @ApiResponse(responseCode = "404")
    @PreAuthorize("hasAuthority('AUDIT_READ')")
    public ResponseEntity<Page<AuditChangementDto>> details(@PathVariable Long id, Pageable pageable) {
        return ResponseEntity.ok(journalService.details(id, pageable));
    }

    @GetMapping("/historique/{entite}/{id}")
    @Operation(summary = "Toutes les versions d'un enregistrement (ex. /logs/historique/paie/42), de la plus récente à la plus ancienne")
    @ApiResponse(responseCode = "404")
    @PreAuthorize("hasAuthority('AUDIT_READ')")
    public ResponseEntity<Page<AuditVersionDto>> historique(@PathVariable String entite, @PathVariable Long id, Pageable pageable) {
        return ResponseEntity.ok(journalService.historique(entite, id, pageable));
    }
}

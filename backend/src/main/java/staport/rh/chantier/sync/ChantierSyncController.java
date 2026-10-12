package staport.rh.chantier.sync;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/chantiers/sync")
@Tag(name = "Chantiers", description = "Référentiel des chantiers et synchronisation avec l'ERP source")
public class ChantierSyncController {

    private final ChantierSyncService syncService;

    public ChantierSyncController(ChantierSyncService syncService) {
        this.syncService = syncService;
    }

    @PostMapping
    @Operation(summary = "Déclencher la synchronisation chantiers")
    @PreAuthorize("hasAuthority('CHANTIER_SYNC')")
    public ResponseEntity<ChantierSyncResultDto> synchroniser() {
        return ResponseEntity.ok(syncService.synchroniser());
    }
}

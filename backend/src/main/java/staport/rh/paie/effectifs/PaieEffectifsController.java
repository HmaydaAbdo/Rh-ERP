package staport.rh.paie.effectifs;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import staport.rh.paie.services.interfaces.IPaieEffectifsService;

import java.util.List;

@RestController
@RequestMapping("/paie/effectifs")
@Tag(name = "Paie", description = "Bulletins de paie, import, export et rapport PDF")
public class PaieEffectifsController {

    private final IPaieEffectifsService effectifsService;

    public PaieEffectifsController(IPaieEffectifsService effectifsService) {
        this.effectifsService = effectifsService;
    }

    @PostMapping
    @Operation(summary = "Tendances des effectifs mois par mois : employés payés, entrées, sorties et mutations de chantier " +
            "(Analytique des employés)")
    @PreAuthorize("hasAuthority('PAIE_READ')")
    public ResponseEntity<List<EffectifMoisDto>> tendances(@Valid @RequestBody(required = false) EffectifsCriteria criteres) {
        return ResponseEntity.ok(effectifsService.tendances(criteres));
    }
}

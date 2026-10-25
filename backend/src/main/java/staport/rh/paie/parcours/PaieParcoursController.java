package staport.rh.paie.parcours;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import staport.rh.common.dtos.ErrorResponseDto;
import staport.rh.paie.services.interfaces.IPaieParcoursService;

@RestController
@RequestMapping("/paie/employes")
@Tag(name = "Paie", description = "Bulletins de paie, import, export et rapport PDF")
public class PaieParcoursController {

    private final IPaieParcoursService parcoursService;

    public PaieParcoursController(IPaieParcoursService parcoursService) {
        this.parcoursService = parcoursService;
    }

    @GetMapping("/{id}/parcours")
    @Operation(summary = "Parcours d'un employé tel que sa paie le raconte : indicateurs, mois de paie et événements " +
            "(entrée, changements de chantier, de fonction, d'équipe ou de salaire, départs, retours), du plus récent au plus ancien")
    @ApiResponse(responseCode = "200", description = "Parcours de l'employé")
    @ApiResponse(responseCode = "404", description = "L'employé demandé n'existe pas.",
            content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponseDto.class)))
    @PreAuthorize("hasAuthority('PAIE_READ')")
    public ResponseEntity<ParcoursEmployeDto> parcours(@PathVariable Long id) {
        return ResponseEntity.ok(parcoursService.parcours(id));
    }
}

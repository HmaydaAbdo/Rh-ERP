package staport.rh.chantier.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import staport.rh.chantier.dtos.request.ChantierCreateRequestDto;
import staport.rh.chantier.dtos.request.ChantierSearchCriteria;
import staport.rh.chantier.dtos.request.ChantierUpdateRequestDto;
import staport.rh.chantier.dtos.response.ChantierResponseDto;
import staport.rh.chantier.services.interfaces.IChantierService;

@RestController
@RequestMapping("/chantiers")
@Tag(name = "Chantiers", description = "Référentiel des chantiers sur lesquels les employés sont affectés")
public class ChantierController {

    private final IChantierService chantierService;

    public ChantierController(IChantierService chantierService) {
        this.chantierService = chantierService;
    }

    @PostMapping
    @Operation(summary = "Créer un chantier")
    @ApiResponse(responseCode = "201")
    @ApiResponse(responseCode = "400")
    @ApiResponse(responseCode = "409")
    @PreAuthorize("hasAuthority('CHANTIER_WRITE')")
    public ResponseEntity<ChantierResponseDto> creer(@Valid @RequestBody ChantierCreateRequestDto dto) {
        ChantierResponseDto created = chantierService.create(dto);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Modifier un chantier")
    @ApiResponse(responseCode = "400")
    @ApiResponse(responseCode = "404")
    @ApiResponse(responseCode = "409")
    @PreAuthorize("hasAuthority('CHANTIER_WRITE')")
    public ResponseEntity<ChantierResponseDto> modifier(
            @PathVariable Long id,
            @Valid @RequestBody ChantierUpdateRequestDto dto) {
        return ResponseEntity.ok(chantierService.update(id, dto));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Consulter un chantier")
    @ApiResponse(responseCode = "404")
    @PreAuthorize("hasAuthority('CHANTIER_READ')")
    public ResponseEntity<ChantierResponseDto> lireParId(@PathVariable Long id) {
        return ResponseEntity.ok(chantierService.findById(id));
    }

    @PostMapping("/search")
    @Operation(summary = "Rechercher des chantiers")
    @PreAuthorize("hasAuthority('CHANTIER_READ')")
    public ResponseEntity<Page<ChantierResponseDto>> rechercher(
            @Valid @RequestBody(required = false) ChantierSearchCriteria criteria,
            Pageable pageable) {
        return ResponseEntity.ok(chantierService.search(criteria, pageable));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Supprimer un chantier")
    @ApiResponse(responseCode = "204")
    @ApiResponse(responseCode = "404")
    @ApiResponse(responseCode = "409")
    @PreAuthorize("hasAuthority('CHANTIER_DELETE')")
    public ResponseEntity<Void> supprimer(@PathVariable Long id) {
        chantierService.delete(id);
        return ResponseEntity.noContent().build();
    }
}

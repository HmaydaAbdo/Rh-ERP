package staport.rh.paie.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import staport.rh.paie.dtos.request.PaieCreateRequestDto;
import staport.rh.paie.dtos.request.PaieSearchCriteria;
import staport.rh.paie.dtos.request.PaieUpdateRequestDto;
import staport.rh.paie.dtos.response.PaieResponseDto;
import staport.rh.paie.services.interfaces.IPaieService;

@RestController
@RequestMapping("/paie")
@Tag(name = "Paie", description = "Bulletins de paie mensuels des employés")
public class PaieController {

    private final IPaieService paieService;

    public PaieController(IPaieService paieService) {
        this.paieService = paieService;
    }

    @PostMapping
    @Operation(summary = "Créer un bulletin de paie")
    @ApiResponse(responseCode = "201")
    @ApiResponse(responseCode = "400")
    @ApiResponse(responseCode = "409")
    public ResponseEntity<PaieResponseDto> creer(@Valid @RequestBody PaieCreateRequestDto dto) {
        PaieResponseDto created = paieService.create(dto);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Modifier un bulletin de paie")
    @ApiResponse(responseCode = "400")
    @ApiResponse(responseCode = "404")
    public ResponseEntity<PaieResponseDto> modifier(
            @PathVariable Long id,
            @Valid @RequestBody PaieUpdateRequestDto dto) {
        return ResponseEntity.ok(paieService.update(id, dto));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Consulter un bulletin de paie")
    @ApiResponse(responseCode = "404")
    public ResponseEntity<PaieResponseDto> lireParId(@PathVariable Long id) {
        return ResponseEntity.ok(paieService.findById(id));
    }

    @PostMapping("/search")
    @Operation(summary = "Rechercher des bulletins de paie")
    public ResponseEntity<Page<PaieResponseDto>> rechercher(
            @RequestBody(required = false) PaieSearchCriteria criteria,
            Pageable pageable) {
        return ResponseEntity.ok(paieService.search(criteria, pageable));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Supprimer un bulletin de paie")
    @ApiResponse(responseCode = "204")
    @ApiResponse(responseCode = "404")
    // TODO(security) : réserver au SYSTEM_ADMIN une fois l'infrastructure JWT/RBAC en place (voir TODO.md)
    public ResponseEntity<Void> supprimer(@PathVariable Long id) {
        paieService.delete(id);
        return ResponseEntity.noContent().build();
    }
}

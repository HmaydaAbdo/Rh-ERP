package staport.rh.equipe.controller;

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
import staport.rh.equipe.dtos.request.EquipeCreateRequestDto;
import staport.rh.equipe.dtos.request.EquipeSearchCriteria;
import staport.rh.equipe.dtos.request.EquipeUpdateRequestDto;
import staport.rh.equipe.dtos.response.EquipeResponseDto;
import staport.rh.equipe.services.interfaces.IEquipeService;

@RestController
@RequestMapping("/equipes")
@Tag(name = "Équipes", description = "Référentiel des équipes de travail, partagé par tous les chantiers")
public class EquipeController {

    private final IEquipeService equipeService;

    public EquipeController(IEquipeService equipeService) {
        this.equipeService = equipeService;
    }

    @PostMapping
    @Operation(summary = "Créer une équipe")
    @ApiResponse(responseCode = "201")
    @ApiResponse(responseCode = "400")
    @ApiResponse(responseCode = "409")
    @PreAuthorize("hasAuthority('EQUIPE_WRITE')")
    public ResponseEntity<EquipeResponseDto> creer(@Valid @RequestBody EquipeCreateRequestDto dto) {
        EquipeResponseDto created = equipeService.create(dto);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Modifier une équipe")
    @ApiResponse(responseCode = "400")
    @ApiResponse(responseCode = "404")
    @ApiResponse(responseCode = "409")
    @PreAuthorize("hasAuthority('EQUIPE_WRITE')")
    public ResponseEntity<EquipeResponseDto> modifier(
            @PathVariable Long id,
            @Valid @RequestBody EquipeUpdateRequestDto dto) {
        return ResponseEntity.ok(equipeService.update(id, dto));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Consulter une équipe")
    @ApiResponse(responseCode = "404")
    @PreAuthorize("hasAuthority('EQUIPE_READ')")
    public ResponseEntity<EquipeResponseDto> lireParId(@PathVariable Long id) {
        return ResponseEntity.ok(equipeService.findById(id));
    }

    @PostMapping("/search")
    @Operation(summary = "Rechercher des équipes")
    @PreAuthorize("hasAuthority('EQUIPE_READ')")
    public ResponseEntity<Page<EquipeResponseDto>> rechercher(
            @Valid @RequestBody(required = false) EquipeSearchCriteria criteria,
            Pageable pageable) {
        return ResponseEntity.ok(equipeService.search(criteria, pageable));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Supprimer une équipe")
    @ApiResponse(responseCode = "204")
    @ApiResponse(responseCode = "404")
    @ApiResponse(responseCode = "409")
    @PreAuthorize("hasAuthority('EQUIPE_DELETE')")
    public ResponseEntity<Void> supprimer(@PathVariable Long id) {
        equipeService.delete(id);
        return ResponseEntity.noContent().build();
    }
}

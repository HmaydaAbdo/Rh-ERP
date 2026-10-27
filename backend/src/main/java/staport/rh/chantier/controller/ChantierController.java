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
import staport.rh.chantier.dtos.request.ChantierStatutRequestDto;
import staport.rh.chantier.dtos.response.ChantierCarteDto;
import java.util.List;
import staport.rh.chantier.services.interfaces.IChantierService;

@RestController
@RequestMapping("/chantiers")
@Tag(name = "Chantiers", description = "Référentiel des chantiers et synchronisation avec l'ERP source")
public class ChantierController {

    private final IChantierService chantierService;

    public ChantierController(IChantierService chantierService) {
        this.chantierService = chantierService;
    }

    @PostMapping
    @Operation(summary = "Créer un chantier")
    @ApiResponse(responseCode = "201", description = "Chantier créé.")
    @ApiResponse(responseCode = "400", description = "Les champs du chantier ou une référence ne respectent pas les règles de validation.")
    @ApiResponse(responseCode = "409", description = "Un chantier avec ce code existe déjà ou une contrainte métier interdit l'opération.")
    @PreAuthorize("hasAuthority('CHANTIER_WRITE')")
    public ResponseEntity<ChantierResponseDto> creer(@Valid @RequestBody ChantierCreateRequestDto dto) {
        ChantierResponseDto created = chantierService.create(dto);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Modifier un chantier")
    @ApiResponse(responseCode = "400", description = "Les champs du chantier ou une référence ne respectent pas les règles de validation.")
    @ApiResponse(responseCode = "404", description = "Le chantier demandé n'existe pas.")
    @ApiResponse(responseCode = "409", description = "Le code du chantier existe déjà ou une contrainte métier interdit la modification.")
    @PreAuthorize("hasAuthority('CHANTIER_WRITE')")
    public ResponseEntity<ChantierResponseDto> modifier(
            @PathVariable Long id,
            @Valid @RequestBody ChantierUpdateRequestDto dto) {
        return ResponseEntity.ok(chantierService.update(id, dto));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Consulter un chantier")
    @ApiResponse(responseCode = "404", description = "Le chantier demandé n'existe pas.")
    @PreAuthorize("hasAuthority('CHANTIER_READ')")
    public ResponseEntity<ChantierResponseDto> lireParId(@PathVariable Long id) {
        return ResponseEntity.ok(chantierService.findById(id));
    }

    @PutMapping("/{id}/statut")
    @Operation(summary = "Clôturer ou rouvrir un chantier sans modifier sa qualification")
    @PreAuthorize("hasAuthority('CHANTIER_WRITE')")
    public ResponseEntity<ChantierResponseDto> changerStatut(@PathVariable Long id, @Valid @RequestBody ChantierStatutRequestDto dto) {
        return ResponseEntity.ok(chantierService.changerStatut(id, dto));
    }

    @GetMapping("/carte")
    @Operation(summary = "Lire les chantiers qualifiés dont l'affichage sur la carte est autorisé")
    @PreAuthorize("hasAuthority('CARTE_READ')")
    public ResponseEntity<List<ChantierCarteDto>> carte() {
        return ResponseEntity.ok(chantierService.carte());
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
    @ApiResponse(responseCode = "204", description = "Chantier supprimé.")
    @ApiResponse(responseCode = "404", description = "Le chantier demandé n'existe pas.")
    @ApiResponse(responseCode = "409", description = "Le chantier est encore référencé et ne peut pas être supprimé.")
    @PreAuthorize("hasAuthority('CHANTIER_DELETE')")
    public ResponseEntity<Void> supprimer(@PathVariable Long id) {
        chantierService.delete(id);
        return ResponseEntity.noContent().build();
    }
}

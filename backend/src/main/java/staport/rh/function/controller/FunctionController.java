package staport.rh.function.controller;

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
import staport.rh.function.dtos.request.FunctionCreateRequestDto;
import staport.rh.function.dtos.request.FunctionSearchCriteria;
import staport.rh.function.dtos.request.FunctionUpdateRequestDto;
import staport.rh.function.dtos.response.FunctionResponseDto;
import staport.rh.function.services.interfaces.IFunctionService;

@RestController
@RequestMapping("/functions")
@Tag(name = "Fonctions", description = "Référentiel des fonctions occupées par les employés et import Excel")
public class FunctionController {

    private final IFunctionService functionService;

    public FunctionController(IFunctionService functionService) {
        this.functionService = functionService;
    }

    @PostMapping
    @Operation(summary = "Créer une fonction")
    @ApiResponse(responseCode = "201", description = "Fonction créée.")
    @ApiResponse(responseCode = "400", description = "Le libellé ne respecte pas les règles de validation.")
    @ApiResponse(responseCode = "409", description = "Une fonction avec ce libellé existe déjà.")
    @PreAuthorize("hasAuthority('FUNCTION_WRITE')")
    public ResponseEntity<FunctionResponseDto> creer(@Valid @RequestBody FunctionCreateRequestDto dto) {
        FunctionResponseDto created = functionService.create(dto);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Modifier une fonction")
    @ApiResponse(responseCode = "400", description = "Le libellé ne respecte pas les règles de validation.")
    @ApiResponse(responseCode = "404", description = "La fonction demandée n'existe pas.")
    @ApiResponse(responseCode = "409", description = "Une fonction avec ce libellé existe déjà.")
    @PreAuthorize("hasAuthority('FUNCTION_WRITE')")
    public ResponseEntity<FunctionResponseDto> modifier(
            @PathVariable Long id,
            @Valid @RequestBody FunctionUpdateRequestDto dto) {
        return ResponseEntity.ok(functionService.update(id, dto));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Consulter une fonction")
    @ApiResponse(responseCode = "404", description = "La fonction demandée n'existe pas.")
    @PreAuthorize("hasAuthority('FUNCTION_READ')")
    public ResponseEntity<FunctionResponseDto> lireParId(@PathVariable Long id) {
        return ResponseEntity.ok(functionService.findById(id));
    }

    @PostMapping("/search")
    @Operation(summary = "Rechercher des fonctions")
    @PreAuthorize("hasAuthority('FUNCTION_READ')")
    public ResponseEntity<Page<FunctionResponseDto>> rechercher(
            @Valid @RequestBody(required = false) FunctionSearchCriteria criteria,
            Pageable pageable) {
        return ResponseEntity.ok(functionService.search(criteria, pageable));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Supprimer une fonction")
    @ApiResponse(responseCode = "204", description = "Fonction supprimée.")
    @ApiResponse(responseCode = "404", description = "La fonction demandée n'existe pas.")
    @ApiResponse(responseCode = "409", description = "La fonction est utilisée et ne peut pas être supprimée.")
    @PreAuthorize("hasAuthority('FUNCTION_DELETE')")
    public ResponseEntity<Void> supprimer(@PathVariable Long id) {
        functionService.delete(id);
        return ResponseEntity.noContent().build();
    }
}

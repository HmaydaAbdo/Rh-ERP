package staport.rh.employee.controller;

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
import staport.rh.employee.dtos.request.EmployeeCreateRequestDto;
import staport.rh.employee.dtos.request.EmployeeSearchCriteria;
import staport.rh.employee.dtos.request.EmployeeUpdateRequestDto;
import staport.rh.employee.dtos.response.EmployeeResponseDto;
import staport.rh.employee.services.interfaces.IEmployeeService;

@RestController
@RequestMapping("/employees")
@Tag(name = "Employés", description = "Gestion des fiches d'employés et import Excel")
public class EmployeeController {

    private final IEmployeeService employeeService;

    public EmployeeController(IEmployeeService employeeService) {
        this.employeeService = employeeService;
    }

    @PostMapping
    @Operation(summary = "Créer un employé")
    @ApiResponse(responseCode = "201", description = "Employé créé.")
    @ApiResponse(responseCode = "400", description = "Les champs de l'employé ou une référence ne respectent pas les règles de validation.")
    @ApiResponse(responseCode = "409", description = "Le CIN est déjà utilisé ou une contrainte métier interdit l'opération.")
    @PreAuthorize("hasAuthority('EMPLOYEE_WRITE')")
    public ResponseEntity<EmployeeResponseDto> creer(@Valid @RequestBody EmployeeCreateRequestDto dto) {
        EmployeeResponseDto created = employeeService.create(dto);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Modifier un employé")
    @ApiResponse(responseCode = "400", description = "Les champs de l'employé ou une référence ne respectent pas les règles de validation.")
    @ApiResponse(responseCode = "404", description = "L'employé demandé n'existe pas.")
    @ApiResponse(responseCode = "409", description = "Le CIN est déjà utilisé.")
    @PreAuthorize("hasAuthority('EMPLOYEE_WRITE')")
    public ResponseEntity<EmployeeResponseDto> modifier(
            @PathVariable Long id,
            @Valid @RequestBody EmployeeUpdateRequestDto dto) {
        return ResponseEntity.ok(employeeService.update(id, dto));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Consulter un employé")
    @ApiResponse(responseCode = "404", description = "L'employé demandé n'existe pas.")
    @PreAuthorize("hasAuthority('EMPLOYEE_READ')")
    public ResponseEntity<EmployeeResponseDto> lireParId(@PathVariable Long id) {
        return ResponseEntity.ok(employeeService.findById(id));
    }

    @PostMapping("/search")
    @Operation(summary = "Rechercher des employés")
    @PreAuthorize("hasAuthority('EMPLOYEE_READ')")
    public ResponseEntity<Page<EmployeeResponseDto>> rechercher(
            @Valid @RequestBody(required = false) EmployeeSearchCriteria criteria,
            Pageable pageable) {
        return ResponseEntity.ok(employeeService.search(criteria, pageable));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Supprimer un employé")
    @ApiResponse(responseCode = "204", description = "Employé supprimé.")
    @ApiResponse(responseCode = "404", description = "L'employé demandé n'existe pas.")
    @PreAuthorize("hasAuthority('EMPLOYEE_DELETE')")
    public ResponseEntity<Void> supprimer(@PathVariable Long id) {
        employeeService.delete(id);
        return ResponseEntity.noContent().build();
    }
}

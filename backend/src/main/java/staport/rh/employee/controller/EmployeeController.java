package staport.rh.employee.controller;

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
import staport.rh.employee.dtos.request.EmployeeCreateRequestDto;
import staport.rh.employee.dtos.request.EmployeeSearchCriteria;
import staport.rh.employee.dtos.request.EmployeeUpdateRequestDto;
import staport.rh.employee.dtos.response.EmployeeResponseDto;
import staport.rh.employee.services.interfaces.IEmployeeService;

@RestController
@RequestMapping("/employees")
@Tag(name = "Employés", description = "Gestion de la fiche d'identité des employés")
public class EmployeeController {

    private final IEmployeeService employeeService;

    public EmployeeController(IEmployeeService employeeService) {
        this.employeeService = employeeService;
    }

    @PostMapping
    @Operation(summary = "Créer un employé")
    @ApiResponse(responseCode = "201")
    @ApiResponse(responseCode = "400")
    @ApiResponse(responseCode = "409")
    public ResponseEntity<EmployeeResponseDto> creer(@Valid @RequestBody EmployeeCreateRequestDto dto) {
        EmployeeResponseDto created = employeeService.create(dto);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Modifier un employé")
    @ApiResponse(responseCode = "400")
    @ApiResponse(responseCode = "404")
    @ApiResponse(responseCode = "409")
    public ResponseEntity<EmployeeResponseDto> modifier(
            @PathVariable Long id,
            @Valid @RequestBody EmployeeUpdateRequestDto dto) {
        return ResponseEntity.ok(employeeService.update(id, dto));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Consulter un employé")
    @ApiResponse(responseCode = "404")
    public ResponseEntity<EmployeeResponseDto> lireParId(@PathVariable Long id) {
        return ResponseEntity.ok(employeeService.findById(id));
    }

    @PostMapping("/search")
    @Operation(summary = "Rechercher des employés")
    public ResponseEntity<Page<EmployeeResponseDto>> rechercher(
            @RequestBody(required = false) EmployeeSearchCriteria criteria,
            Pageable pageable) {
        return ResponseEntity.ok(employeeService.search(criteria, pageable));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Supprimer un employé")
    @ApiResponse(responseCode = "204")
    @ApiResponse(responseCode = "404")
    // TODO(security) : réserver au SYSTEM_ADMIN une fois l'infrastructure JWT/RBAC en place (voir TODO.md)
    public ResponseEntity<Void> supprimer(@PathVariable Long id) {
        employeeService.delete(id);
        return ResponseEntity.noContent().build();
    }
}

package staport.rh.employee.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import staport.rh.employee.dtos.request.EmployeeSearchCriteria;
import staport.rh.employee.dtos.response.EmployeeAnalytiqueDto;
import staport.rh.employee.dtos.response.EmployeeRegroupementDto;
import staport.rh.employee.entities.DimensionEmployes;
import staport.rh.employee.services.interfaces.IEmployeeAnalytiqueService;

import java.util.List;

/** Vues Cartes et Analytique des employés : agrégats du périmètre filtré (aucun salaire). */
@RestController
@RequestMapping("/employees")
@Tag(name = "Employés", description = "Gestion des fiches d'employés et import Excel")
public class EmployeeAnalytiqueController {

    private final IEmployeeAnalytiqueService analytiqueService;

    public EmployeeAnalytiqueController(IEmployeeAnalytiqueService analytiqueService) {
        this.analytiqueService = analytiqueService;
    }

    @PostMapping("/regroupements")
    @Operation(summary = "Regrouper les employés du périmètre par chantier, équipe ou fonction (vue Cartes)")
    @PreAuthorize("hasAuthority('EMPLOYEE_READ')")
    public ResponseEntity<List<EmployeeRegroupementDto>> regrouper(
            @Parameter(description = "Dimension du regroupement", example = "CHANTIER") @RequestParam DimensionEmployes dimension,
            @Valid @RequestBody(required = false) EmployeeSearchCriteria criteria) {
        return ResponseEntity.ok(analytiqueService.regrouper(criteria, dimension));
    }

    @PostMapping("/analytique")
    @Operation(summary = "Chiffres clés des employés du périmètre : effectif, âge et ancienneté, tranches (vue Analytique)")
    @PreAuthorize("hasAuthority('EMPLOYEE_READ')")
    public ResponseEntity<EmployeeAnalytiqueDto> analyser(@Valid @RequestBody(required = false) EmployeeSearchCriteria criteria) {
        return ResponseEntity.ok(analytiqueService.analyser(criteria));
    }
}

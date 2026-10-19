package staport.rh.employee.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
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

import java.util.Set;

/**
 * Le salaire et son type sont des données de paie : sans {@code PAIE_READ}, ils ne sont jamais renvoyés (valeur {@code null})
 * et une écriture ne peut pas les changer — ceux qui sont saisis sont ignorés, ceux de la fiche sont conservés
 * (voir docs/rbac/employee.md). Une recherche ne peut pas non plus être triée par salaire : l'ordre le dévoilerait. Le masquage est fait ici, à la frontière HTTP : les autres domaines lisent le vrai salaire
 * par {@code IEmployeeService}.
 */
@RestController
@RequestMapping("/employees")
@Tag(name = "Employés", description = "Gestion des fiches d'employés et import Excel")
public class EmployeeController {

    /** Champs de la fiche réservés à {@code PAIE_READ}. */
    private static final Set<String> CHAMPS_DE_PAIE = Set.of("salaire", "typeSalaire");

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
    public ResponseEntity<EmployeeResponseDto> creer(@Valid @RequestBody EmployeeCreateRequestDto dto, Authentication authentification) {
        boolean paie = voitLaPaie(authentification);
        EmployeeCreateRequestDto saisie = paie ? dto : new EmployeeCreateRequestDto(dto.nomPrenom(), dto.cin(), dto.dateNaissance(),
                dto.dateEmbauche(), dto.fonctionId(), dto.chantierId(), dto.equipeId(), null, null);
        EmployeeResponseDto created = employeeService.create(saisie);
        return ResponseEntity.status(HttpStatus.CREATED).body(pourLeLecteur(created, paie));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Modifier un employé")
    @ApiResponse(responseCode = "400", description = "Les champs de l'employé ou une référence ne respectent pas les règles de validation.")
    @ApiResponse(responseCode = "404", description = "L'employé demandé n'existe pas.")
    @ApiResponse(responseCode = "409", description = "Le CIN est déjà utilisé.")
    @PreAuthorize("hasAuthority('EMPLOYEE_WRITE')")
    public ResponseEntity<EmployeeResponseDto> modifier(
            @PathVariable Long id,
            @Valid @RequestBody EmployeeUpdateRequestDto dto,
            Authentication authentification) {
        boolean paie = voitLaPaie(authentification);
        EmployeeUpdateRequestDto saisie = dto;
        if (!paie) {
            EmployeeResponseDto actuel = employeeService.findById(id);
            saisie = new EmployeeUpdateRequestDto(dto.version(), dto.nomPrenom(), dto.cin(), dto.dateNaissance(), dto.dateEmbauche(),
                    dto.fonctionId(), dto.chantierId(), dto.equipeId(), actuel.salaire(), actuel.typeSalaire(), dto.statut());
        }
        return ResponseEntity.ok(pourLeLecteur(employeeService.update(id, saisie), paie));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Consulter un employé")
    @ApiResponse(responseCode = "404", description = "L'employé demandé n'existe pas.")
    @PreAuthorize("hasAuthority('EMPLOYEE_READ')")
    public ResponseEntity<EmployeeResponseDto> lireParId(@PathVariable Long id, Authentication authentification) {
        return ResponseEntity.ok(pourLeLecteur(employeeService.findById(id), voitLaPaie(authentification)));
    }

    @PostMapping("/search")
    @Operation(summary = "Rechercher des employés")
    @PreAuthorize("hasAuthority('EMPLOYEE_READ')")
    public ResponseEntity<Page<EmployeeResponseDto>> rechercher(
            @Valid @RequestBody(required = false) EmployeeSearchCriteria criteria,
            Pageable pageable,
            Authentication authentification) {
        boolean paie = voitLaPaie(authentification);
        Pageable page = paie ? pageable : sansTriDePaie(pageable);
        return ResponseEntity.ok(employeeService.search(criteria, page).map(employe -> pourLeLecteur(employe, paie)));
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

    private static Pageable sansTriDePaie(Pageable pageable) {
        Sort tri = Sort.by(pageable.getSort().stream()
                .filter(ordre -> !CHAMPS_DE_PAIE.contains(ordre.getProperty()))
                .toList());
        return pageable.isPaged() ? PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(), tri) : Pageable.unpaged(tri);
    }

    private static boolean voitLaPaie(Authentication authentification) {
        return authentification != null && authentification.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .anyMatch("PAIE_READ"::equals);
    }

    /** La fiche telle que le lecteur peut la voir : sans {@code PAIE_READ}, sans salaire ni type. */
    private static EmployeeResponseDto pourLeLecteur(EmployeeResponseDto employe, boolean voitLaPaie) {
        if (voitLaPaie) {
            return employe;
        }
        return new EmployeeResponseDto(employe.id(), employe.version(), employe.nomPrenom(), employe.cin(), employe.dateNaissance(),
                employe.dateEmbauche(), employe.fonction(), employe.chantier(), employe.equipe(), null, null, employe.statut());
    }
}

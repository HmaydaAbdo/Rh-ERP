package staport.rh.employee.imports;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;

@RestController
@RequestMapping("/employees/import")
@Tag(name = "Employés", description = "Import Excel des employés")
public class EmployeeImportController {

    private final EmployeeImportService importService;

    public EmployeeImportController(EmployeeImportService importService) {
        this.importService = importService;
    }

    @PostMapping
    @Operation(summary = "Importer/mettre à jour des employés depuis un fichier Excel (CIN inédit = création, "
            + "CIN existant = mise à jour complète de la ligne). Import atomique : une seule ligne invalide "
            + "rejette tout le fichier.")
    @ApiResponse(responseCode = "400", description = "Fichier illisible, ou au moins une ligne invalide (voir lignesIgnorees) — rien n'a été créé ni mis à jour")
    @PreAuthorize("hasAuthority('EMPLOYEE_IMPORT')")
    public ResponseEntity<EmployeeImportResultDto> importer(@RequestParam("file") MultipartFile file) {
        EmployeeImportResultDto resultat = importService.importer(file);
        HttpStatus statut = resultat.ignores() > 0 ? HttpStatus.BAD_REQUEST : HttpStatus.OK;
        return ResponseEntity.status(statut).body(resultat);
    }

    @GetMapping("/modele")
    @Operation(summary = "Télécharger le modèle Excel vierge attendu par l'import (6 colonnes, en-tête)")
    @PreAuthorize("hasAuthority('EMPLOYEE_IMPORT')")
    public ResponseEntity<Resource> telechargerModele() {
        ByteArrayInputStream flux = importService.genererModele();
        InputStreamResource ressource = new InputStreamResource(flux);

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=Modele_Import_Employes.xlsx")
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(ressource);
    }
}

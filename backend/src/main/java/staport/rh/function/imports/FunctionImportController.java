package staport.rh.function.imports;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;

@RestController
@RequestMapping("/functions/import")
@Tag(name = "Fonctions", description = "Import Excel du référentiel des fonctions")
public class FunctionImportController {

    private final FunctionImportService importService;

    public FunctionImportController(FunctionImportService importService) {
        this.importService = importService;
    }

    @PostMapping
    @Operation(summary = "Importer des fonctions depuis un fichier Excel (une colonne, une ligne d'en-tête). " +
            "Import atomique : une seule ligne invalide rejette tout le fichier.")
    @ApiResponse(responseCode = "400", description = "Fichier illisible, ou au moins une ligne invalide (voir lignesIgnorees) — rien n'a été créé")
    // TODO(security) : réserver au SYSTEM_ADMIN une fois l'infrastructure JWT/RBAC en place (voir TODO.md)
    public ResponseEntity<FunctionImportResultDto> importer(@RequestParam("file") MultipartFile file) {
        FunctionImportResultDto resultat = importService.importer(file);
        HttpStatus statut = resultat.ignores() > 0 ? HttpStatus.BAD_REQUEST : HttpStatus.OK;
        return ResponseEntity.status(statut).body(resultat);
    }

    @GetMapping("/modele")
    @Operation(summary = "Télécharger le modèle Excel vierge attendu par l'import (une colonne, en-tête \"Fonction\")")
    public ResponseEntity<Resource> telechargerModele() {
        ByteArrayInputStream flux = importService.genererModele();
        InputStreamResource ressource = new InputStreamResource(flux);

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=Modele_Import_Fonctions.xlsx")
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(ressource);
    }
}

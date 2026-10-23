package staport.rh.equipe.imports;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
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
@RequestMapping("/equipes/import")
@Tag(name = "Import des équipes", description = "Import Excel du référentiel des équipes")
public class EquipeImportController {
    private final EquipeImportService importService;

    public EquipeImportController(EquipeImportService importService) {
        this.importService = importService;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Importer des équipes depuis un XLSX (colonnes Code et Libellé). Import atomique.")
    @ApiResponse(responseCode = "200", description = "Import réussi", content = @Content(schema = @Schema(implementation = EquipeImportResultDto.class)))
    @ApiResponse(responseCode = "400", description = "Fichier invalide ou au moins une ligne rejetée; aucune équipe créée")
    @PreAuthorize("hasAuthority('EQUIPE_IMPORT')")
    public ResponseEntity<EquipeImportResultDto> importer(
            @Parameter(description = "Classeur XLSX, 20 Mo maximum; aucune équipe existante n'est modifiée.")
            @RequestParam("file") MultipartFile file) {
        EquipeImportResultDto resultat = importService.importer(file);
        return ResponseEntity.status(resultat.ignores() > 0 ? HttpStatus.BAD_REQUEST : HttpStatus.OK).body(resultat);
    }

    @GetMapping("/modele")
    @Operation(summary = "Télécharger le modèle XLSX vierge (Code, Libellé)")
    @PreAuthorize("hasAuthority('EQUIPE_IMPORT')")
    public ResponseEntity<Resource> telechargerModele() {
        ByteArrayInputStream stream = importService.genererModele();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=Modele_Import_Equipes.xlsx")
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(new InputStreamResource(stream));
    }
}

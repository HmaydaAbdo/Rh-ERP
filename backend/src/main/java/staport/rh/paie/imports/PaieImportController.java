package staport.rh.paie.imports;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
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
import staport.rh.paie.exceptions.InvalidPeriodeException;

import java.io.ByteArrayInputStream;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;

@RestController
@RequestMapping("/paie/import")
@Tag(name = "Paie", description = "Import Excel des bulletins de paie")
public class PaieImportController {

    private final PaieImportService importService;

    public PaieImportController(PaieImportService importService) {
        this.importService = importService;
    }

    @PostMapping
    @Operation(summary = "Importer des bulletins de paie pour une période depuis un fichier Excel. " +
            "Import atomique : une seule ligne invalide rejette tout le fichier. Une fonction absente du " +
            "référentiel est créée automatiquement (jamais l'employé ni le chantier).")
    @ApiResponse(responseCode = "400", description = "Période invalide, fichier illisible, ou au moins une ligne "
            + "invalide (voir lignesIgnorees) — rien n'a été créé ou mis à jour")
    @PreAuthorize("hasAuthority('PAIE_IMPORT')")
    public ResponseEntity<PaieImportResultDto> importer(
            @RequestParam("file") MultipartFile file,
            @Parameter(description = "Période au format aaaa-MM, ex. 2026-08", example = "2026-08")
            @RequestParam("periode") String periode) {
        PaieImportResultDto resultat = importService.importer(file, parsePeriode(periode));
        HttpStatus statut = resultat.ignores() > 0 ? HttpStatus.BAD_REQUEST : HttpStatus.OK;
        return ResponseEntity.status(statut).body(resultat);
    }

    @GetMapping("/modele")
    @Operation(summary = "Télécharger le modèle Excel vierge attendu par l'import (13 colonnes, 3 lignes d'en-tête)")
    @PreAuthorize("hasAuthority('PAIE_IMPORT')")
    public ResponseEntity<Resource> telechargerModele() {
        ByteArrayInputStream flux = importService.genererModele();
        InputStreamResource ressource = new InputStreamResource(flux);

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=Modele_Import_Paie.xlsx")
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(ressource);
    }

    private YearMonth parsePeriode(String periode) {
        try {
            return YearMonth.parse(periode);
        } catch (DateTimeParseException e) {
            throw new InvalidPeriodeException("Période invalide, format attendu aaaa-MM (ex. 2026-08) : " + periode);
        }
    }
}

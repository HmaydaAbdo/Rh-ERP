package staport.rh.paie.imports;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import staport.rh.common.dtos.ErrorResponseDto;
import staport.rh.paie.exceptions.InvalidPeriodeException;

import java.io.ByteArrayInputStream;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;

@RestController
@RequestMapping("/paie/import")
@Tag(name = "Paie", description = "Bulletins de paie, import, export et rapport PDF")
public class PaieImportController {

    private final PaieImportService importService;

    public PaieImportController(PaieImportService importService) {
        this.importService = importService;
    }

    @PostMapping(value = "/analyse", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Analyser un fichier de paie sans rien enregistrer : erreurs du fichier, CIN inconnus, écarts avec les " +
            "fiches employés, départs (STC, actifs absents) et retours (inactifs présents). Le fichier s'importe quand l'analyse est prête.")
    @ApiResponse(responseCode = "200", description = "Analyse du fichier")
    @ApiResponse(responseCode = "400", description = "Mois refusé (seul le mois qui suit le dernier importé est accepté) ou fichier illisible", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponseDto.class)))
    @PreAuthorize("hasAuthority('PAIE_IMPORT') and hasAuthority('PAIE_READ')")
    public ResponseEntity<PaieImportAnalyseDto> analyser(
            @Parameter(description = "Classeur Excel XLSX, maximum 20 Mo") @RequestParam("file") MultipartFile file,
            @Parameter(description = "Mois au format aaaa-MM, ex. 2026-10", example = "2026-10") @RequestParam("periode") String periode) {
        return ResponseEntity.ok(importService.analyser(file, parsePeriode(periode)));
    }

    @PostMapping(value = "/corrections", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Corriger les fiches employés à partir du fichier : aligner des fiches en écart, créer les employés des " +
            "CIN inconnus. Renvoie la nouvelle analyse du fichier.")
    @ApiResponse(responseCode = "200", description = "Nouvelle analyse, après les corrections")
    @ApiResponse(responseCode = "400", description = "Mois refusé, fichier illisible, correction impossible (type de salaire manquant, ligne qui n'est pas un CIN inconnu…)", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponseDto.class)))
    @PreAuthorize("hasAuthority('PAIE_IMPORT') and hasAuthority('EMPLOYEE_WRITE') and hasAuthority('PAIE_READ')")
    public ResponseEntity<PaieImportAnalyseDto> corriger(
            @Parameter(description = "Le même classeur Excel XLSX que celui analysé, maximum 20 Mo") @RequestParam("file") MultipartFile file,
            @Parameter(description = "Mois au format aaaa-MM, ex. 2026-10", example = "2026-10") @RequestParam("periode") String periode,
            @Valid @RequestPart("corrections") PaieImportCorrectionsDto corrections) {
        return ResponseEntity.ok(importService.corriger(file, parsePeriode(periode), corrections));
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Importer un fichier de paie prêt (sans erreur, CIN inconnu ni écart) : crée les bulletins du mois, " +
            "repasse ACTIF les employés revenus et enregistre les départs confirmés. Tout ou rien.")
    @ApiResponse(responseCode = "200", description = "Bilan de l'import", content = @Content(mediaType = "application/json", schema = @Schema(implementation = PaieImportResultDto.class)))
    @ApiResponse(responseCode = "400", description = "Mois refusé, fichier illisible ou pas prêt, départ non proposé par l'analyse — rien n'a été enregistré", content = @Content(mediaType = "application/json", schema = @Schema(implementation = ErrorResponseDto.class)))
    @PreAuthorize("hasAuthority('PAIE_IMPORT')")
    public ResponseEntity<PaieImportResultDto> importer(
            @Parameter(description = "Classeur Excel XLSX, maximum 20 Mo") @RequestParam("file") MultipartFile file,
            @Parameter(description = "Mois au format aaaa-MM, ex. 2026-10", example = "2026-10") @RequestParam("periode") String periode,
            @Valid @RequestPart(value = "departs", required = false) PaieImportDepartsDto departs) {
        PaieImportDepartsDto confirmes = departs != null ? departs : new PaieImportDepartsDto(null);
        return ResponseEntity.ok(importService.importer(file, parsePeriode(periode), confirmes));
    }

    @GetMapping("/modele")
    @Operation(summary = "Télécharger le modèle Excel vierge attendu par l'import (13 colonnes, 3 lignes d'en-tête)")
    @ApiResponse(responseCode = "200", description = "Modèle XLSX à compléter", content = @Content(mediaType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", schema = @Schema(type = "string", format = "binary")))
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

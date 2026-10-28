package staport.rh.heuresupp.controllers;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
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
import staport.rh.heuresupp.imports.HeuresSuppImportAnalyseDto;
import staport.rh.heuresupp.imports.HeuresSuppImportCorrectionsDto;
import staport.rh.heuresupp.imports.HeuresSuppImportForfaitsDto;
import staport.rh.heuresupp.imports.HeuresSuppImportPrerequisDto;
import staport.rh.heuresupp.imports.HeuresSuppImportResultDto;
import staport.rh.heuresupp.imports.HeuresSuppImportService;
import staport.rh.heuresupp.exceptions.InvalidHeuresSuppPeriodeException;

import java.io.ByteArrayInputStream;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;

@RestController
@RequestMapping("/heures-supp/import")
@Tag(name = "Heures supplémentaires — import", description = "Assistant d'import mensuel par chantier")
public class HeuresSuppImportController {

    private static final String TYPE_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    private final HeuresSuppImportService service;

    public HeuresSuppImportController(HeuresSuppImportService service) {
        this.service = service;
    }

    @GetMapping("/prerequis")
    @Operation(summary = "Vérifier le mois et le chantier avant l'ouverture du dépôt Excel")
    @PreAuthorize("hasAuthority('HEURES_SUP_IMPORT') and hasAuthority('PAIE_READ') and hasAuthority('CHANTIER_READ')")
    public HeuresSuppImportPrerequisDto verifierPrerequis(@RequestParam String periode, @RequestParam Long chantierId) {
        return service.verifierPrerequis(parsePeriode(periode), chantierId);
    }

    @PostMapping(value = "/analyse", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Analyser un classeur sans écriture et calculer les grandeurs du mois")
    @PreAuthorize("hasAuthority('HEURES_SUP_IMPORT') and hasAuthority('PAIE_READ') and hasAuthority('EMPLOYEE_READ')")
    public HeuresSuppImportAnalyseDto analyser(
            @Parameter(description = "Classeur Excel XLSX, maximum 20 Mo") @RequestParam("file") MultipartFile fichier,
            @RequestParam String periode,
            @RequestParam Long chantierId,
            @Valid @RequestPart(value = "forfaits", required = false) HeuresSuppImportForfaitsDto forfaits) {
        return service.analyser(fichier, parsePeriode(periode), chantierId, forfaits);
    }

    @PostMapping(value = "/corrections", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Créer dans l'assistant les fiches manquantes, puis renvoyer l'analyse")
    @PreAuthorize("hasAuthority('HEURES_SUP_IMPORT') and hasAuthority('PAIE_READ') and hasAuthority('EMPLOYEE_WRITE')")
    public HeuresSuppImportAnalyseDto corriger(
            @Parameter(description = "Classeur Excel XLSX, maximum 20 Mo") @RequestParam("file") MultipartFile fichier,
            @RequestParam String periode,
            @RequestParam Long chantierId,
            @Valid @RequestPart("corrections") HeuresSuppImportCorrectionsDto corrections,
            @Valid @RequestPart(value = "forfaits", required = false) HeuresSuppImportForfaitsDto forfaits) {
        return service.corriger(fichier, parsePeriode(periode), chantierId, corrections, forfaits);
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Importer atomiquement un lot analysé, pour un seul mois et un seul chantier")
    @PreAuthorize("hasAuthority('HEURES_SUP_IMPORT') and hasAuthority('PAIE_READ') and hasAuthority('EMPLOYEE_READ')")
    public HeuresSuppImportResultDto importer(
            @Parameter(description = "Classeur Excel XLSX, maximum 20 Mo") @RequestParam("file") MultipartFile fichier,
            @RequestParam String periode,
            @RequestParam Long chantierId,
            @Valid @RequestPart(value = "forfaits", required = false) HeuresSuppImportForfaitsDto forfaits) {
        return service.importer(fichier, parsePeriode(periode), chantierId, forfaits);
    }

    @PostMapping(value = "/remplacement", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Remplacer explicitement les lignes existantes du lot pour ce mois et ce chantier")
    @PreAuthorize("hasAuthority('HEURES_SUP_IMPORT') and hasAuthority('PAIE_READ') and hasAuthority('EMPLOYEE_READ')")
    public HeuresSuppImportResultDto remplacer(
            @Parameter(description = "Classeur Excel XLSX, maximum 20 Mo") @RequestParam("file") MultipartFile fichier,
            @RequestParam String periode,
            @RequestParam Long chantierId,
            @Valid @RequestPart(value = "forfaits", required = false) HeuresSuppImportForfaitsDto forfaits) {
        return service.remplacer(fichier, parsePeriode(periode), chantierId, forfaits);
    }

    @GetMapping("/modele")
    @Operation(summary = "Télécharger le modèle Excel CIN et P/H")
    @ApiResponse(responseCode = "200", description = "Modèle XLSX à compléter",
            content = @Content(mediaType = TYPE_XLSX, schema = @Schema(type = "string", format = "binary")))
    @PreAuthorize("hasAuthority('HEURES_SUP_IMPORT') and hasAuthority('PAIE_READ')")
    public ResponseEntity<Resource> telechargerModele() {
        ByteArrayInputStream flux = service.genererModele();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=Modele_Heures_Supplementaires.xlsx")
                .contentType(MediaType.parseMediaType(TYPE_XLSX))
                .body(new InputStreamResource(flux));
    }

    private YearMonth parsePeriode(String periode) {
        try {
            return YearMonth.parse(periode);
        } catch (DateTimeParseException e) {
            throw new InvalidHeuresSuppPeriodeException("Période invalide, format attendu aaaa-MM (ex. 2026-10) : " + periode);
        }
    }
}

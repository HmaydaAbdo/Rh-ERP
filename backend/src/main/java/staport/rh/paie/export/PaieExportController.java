package staport.rh.paie.export;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import staport.rh.paie.exceptions.InvalidPeriodeException;

import java.io.ByteArrayInputStream;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.List;

/**
 * Export multi-feuilles (GLB + par chantier + par équipe) pour une période donnée.
 * Exemple : GET /paie/export?periode=2026-08&amp;chantiersEquipes=C208,C209
 */
@RestController
@RequestMapping("/paie/export")
@Tag(name = "Paie", description = "Export Excel multi-feuilles des bulletins de paie")
public class PaieExportController {

    private final PaieExportService exportService;

    public PaieExportController(PaieExportService exportService) {
        this.exportService = exportService;
    }

    @GetMapping
    @Operation(summary = "Exporter la paie d'une période (GLB + par chantier + par équipe)")
    public ResponseEntity<Resource> exporter(
            @Parameter(description = "Période au format aaaa-MM, ex. 2026-08", example = "2026-08")
            @RequestParam("periode") String periode,
            @Parameter(description = "Codes chantier pour lesquels générer aussi une feuille par équipe")
            @RequestParam(required = false) List<String> chantiersEquipes) {

        YearMonth periodeAnalysee = parsePeriode(periode);
        ByteArrayInputStream flux = exportService.exporter(periodeAnalysee, chantiersEquipes);
        InputStreamResource ressource = new InputStreamResource(flux);

        String nomFichier = "Paie_Export_" + periodeAnalysee + ".xlsx";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=" + nomFichier)
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

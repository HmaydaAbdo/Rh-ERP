package staport.rh.paie.export;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import staport.rh.paie.exceptions.InvalidPeriodeException;

import java.io.ByteArrayInputStream;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;

/**
 * Export multi-feuilles (GLB + par chantier + par équipe) pour une période donnée. La
 * configuration des feuilles par équipe (aucune / toutes / sélection par chantier) et des
 * exclusions de la feuille chantier est portée par le corps de la requête (voir
 * {@link PaieExportRequestDto}) — un {@code GET} avec query params ne suffisait plus à exprimer
 * une sélection par chantier.
 */
@RestController
@RequestMapping("/paie/export")
@Tag(name = "Paie", description = "Export Excel multi-feuilles des bulletins de paie")
public class PaieExportController {

    private final PaieExportService exportService;

    public PaieExportController(PaieExportService exportService) {
        this.exportService = exportService;
    }

    @PostMapping
    @Operation(summary = "Exporter la paie d'une période (GLB + par chantier + par équipe)")
    @PreAuthorize("hasAuthority('PAIE_EXPORT')")
    public ResponseEntity<Resource> exporter(@Valid @RequestBody PaieExportRequestDto requete) {
        YearMonth periodeAnalysee = parsePeriode(requete.periode());
        ByteArrayInputStream flux = exportService.exporter(periodeAnalysee, requete);
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

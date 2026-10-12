package staport.rh.paie.report;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import staport.rh.paie.exceptions.InvalidPeriodeException;

import java.time.YearMonth;
import java.time.format.DateTimeParseException;

/**
 * Rapport PDF BI RH/Paie de synthèse pour la direction — masse de paie, effectif, distributions
 * chantier/équipe/fonction, comparaison au mois précédent, puis détail chantier par chantier (voir
 * {@code docs/report/README.md}). Périmètre = mêmes filtres que {@code POST /paie/search}
 * ({@link PaieReportPdfRequestDto}), pas une sélection manuelle de feuilles comme l'export Excel
 * ({@code PaieExportController}, même permission {@code PAIE_EXPORT}, même source {@code Paie} mais
 * calcul de périmètre distinct — voir README, section « Pourquoi deux périmètres ? »).
 */
@RestController
@RequestMapping("/paie/report")
@Tag(name = "Paie", description = "Bulletins de paie, import, export et rapport PDF")
public class PaieReportController {

    private final PaieReportHtmlPdfService pdfService;

    public PaieReportController(PaieReportHtmlPdfService pdfService) {
        this.pdfService = pdfService;
    }

    @PostMapping("/pdf")
    @Operation(summary = "Télécharger le rapport PDF BI de la paie sur le périmètre filtré (période obligatoire)")
    @ApiResponse(responseCode = "200", description = "Rapport PDF", content = @Content(mediaType = "application/pdf", schema = @Schema(type = "string", format = "binary")))
    @ApiResponse(responseCode = "400", description = "Période ou filtres invalides", content = @Content(mediaType = "application/json", schema = @Schema(implementation = staport.rh.common.dtos.ErrorResponseDto.class)))
    @PreAuthorize("hasAuthority('PAIE_EXPORT')")
    public ResponseEntity<byte[]> telecharger(@Valid @RequestBody PaieReportPdfRequestDto requete) {
        YearMonth periode = parsePeriode(requete.periode());
        byte[] pdf = pdfService.generer(periode, requete);

        String nomFichier = "Paie_Rapport_" + periode + ".pdf";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=" + nomFichier)
                .contentType(MediaType.APPLICATION_PDF)
                .contentLength(pdf.length)
                .body(pdf);
    }

    private YearMonth parsePeriode(String periode) {
        if (periode == null) {
            throw new InvalidPeriodeException("Période obligatoire, format attendu aaaa-MM (ex. 2026-08).");
        }
        try {
            return YearMonth.parse(periode);
        } catch (DateTimeParseException e) {
            throw new InvalidPeriodeException("Période invalide, format attendu aaaa-MM (ex. 2026-08) : " + periode);
        }
    }
}

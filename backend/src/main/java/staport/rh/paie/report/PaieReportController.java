package staport.rh.paie.report;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
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
 * Rapport PDF de paie — hiérarchie Chantier → Équipe — pour une période donnée. Endpoint frère de
 * {@code PaieExportController} : mêmes données, même permission — l'export Excel reste inchangé.
 */
@RestController
@RequestMapping("/paie/report")
@Tag(name = "Paie", description = "Rapport PDF (reporting direction) des bulletins de paie, par chantier et par équipe")
public class PaieReportController {

    private final PaieReportPdfService pdfService;

    public PaieReportController(PaieReportPdfService pdfService) {
        this.pdfService = pdfService;
    }

    @PostMapping("/pdf")
    @Operation(summary = "Télécharger le rapport PDF de paie d'une période (par chantier et équipe)")
    @PreAuthorize("hasAuthority('PAIE_EXPORT')")
    public ResponseEntity<byte[]> telecharger(@RequestBody PaieReportPdfRequestDto requete) {
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
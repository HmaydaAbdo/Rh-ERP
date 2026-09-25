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
 * Rapport PDF BI RH/Paie de synthèse pour la direction — masse de paie, effectif, distributions
 * chantier/équipe/fonction, comparaison au mois précédent, puis détail chantier par chantier (voir
 * {@code docs/report/README.md}). Périmètre = mêmes filtres que {@code POST /paie/search}
 * ({@link PaieReportPdfRequestDto}), pas une sélection manuelle de feuilles comme l'export Excel
 * ({@code PaieExportController}, même permission {@code PAIE_EXPORT}, même source {@code Paie} mais
 * calcul de périmètre distinct — voir README, section « Pourquoi deux périmètres ? »).
 */
@RestController
@RequestMapping("/paie/report")
@Tag(name = "Paie", description = "Rapport PDF BI de synthèse RH/Paie pour la direction")
public class PaieReportController {

    private final PaieReportPdfService pdfService;

    public PaieReportController(PaieReportPdfService pdfService) {
        this.pdfService = pdfService;
    }

    @PostMapping("/pdf")
    @Operation(summary = "Télécharger le rapport PDF BI de la paie sur le périmètre filtré (période obligatoire)")
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
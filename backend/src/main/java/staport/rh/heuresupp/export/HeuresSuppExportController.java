package staport.rh.heuresupp.export;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/heures-supp/export")
@Tag(name = "Heures supplémentaires", description = "Heures supplémentaires mensuelles et forfaits par chantier")
public class HeuresSuppExportController {

    private final HeuresSuppExportPdfService service;

    public HeuresSuppExportController(HeuresSuppExportPdfService service) {
        this.service = service;
    }

    @PostMapping("/pdf")
    @Operation(summary = "Télécharger le rapport PDF des heures supplémentaires sur le périmètre filtré, recherché et trié de la vue Tabulaire")
    @ApiResponse(responseCode = "200", description = "Rapport PDF", content = @Content(mediaType = "application/pdf", schema = @Schema(type = "string", format = "binary")))
    @PreAuthorize("hasAuthority('HEURES_SUP_READ') and hasAuthority('PAIE_READ')")
    public ResponseEntity<byte[]> telecharger(@Valid @RequestBody HeuresSuppExportRequestDto requete) {
        byte[] pdf = service.generer(requete);
        String nom = "Heures_supplementaires_" + (requete.periode() == null ? "tous-les-mois" : requete.periode()) + ".pdf";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=" + nom)
                .contentType(MediaType.APPLICATION_PDF)
                .contentLength(pdf.length)
                .body(pdf);
    }
}

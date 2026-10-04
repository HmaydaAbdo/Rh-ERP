package staport.rh.paie.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import staport.rh.paie.dtos.request.PaieCreateRequestDto;
import staport.rh.paie.dtos.request.PaieSearchCriteria;
import staport.rh.paie.dtos.request.PaieUpdateRequestDto;
import staport.rh.paie.dtos.response.PaieAnalytiqueDto;
import staport.rh.paie.dtos.response.PaieChantierPeriodeDto;
import staport.rh.paie.dtos.response.PaieMaterielTableauDto;
import staport.rh.paie.dtos.response.PaiePeriodeResumeDto;
import staport.rh.paie.dtos.response.PaieResponseDto;
import staport.rh.paie.exceptions.InvalidPeriodeException;
import staport.rh.paie.services.interfaces.IPaieAnalytiqueService;
import staport.rh.paie.services.interfaces.IPaieService;

import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.List;

@RestController
@RequestMapping("/paie")
@Tag(name = "Paie", description = "Bulletins de paie mensuels des employés")
public class PaieController {

    private final IPaieService paieService;
    private final IPaieAnalytiqueService paieAnalytiqueService;

    public PaieController(IPaieService paieService, IPaieAnalytiqueService paieAnalytiqueService) {
        this.paieService = paieService;
        this.paieAnalytiqueService = paieAnalytiqueService;
    }

    @PostMapping
    @Operation(summary = "Créer un bulletin de paie")
    @ApiResponse(responseCode = "201")
    @ApiResponse(responseCode = "400")
    @ApiResponse(responseCode = "409")
    @PreAuthorize("hasAuthority('PAIE_WRITE')")
    public ResponseEntity<PaieResponseDto> creer(@Valid @RequestBody PaieCreateRequestDto dto) {
        PaieResponseDto created = paieService.create(dto);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Modifier un bulletin de paie")
    @ApiResponse(responseCode = "400")
    @ApiResponse(responseCode = "404")
    @PreAuthorize("hasAuthority('PAIE_WRITE')")
    public ResponseEntity<PaieResponseDto> modifier(
            @PathVariable Long id,
            @Valid @RequestBody PaieUpdateRequestDto dto) {
        return ResponseEntity.ok(paieService.update(id, dto));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Consulter un bulletin de paie")
    @ApiResponse(responseCode = "404")
    @PreAuthorize("hasAuthority('PAIE_READ')")
    public ResponseEntity<PaieResponseDto> lireParId(@PathVariable Long id) {
        return ResponseEntity.ok(paieService.findById(id));
    }

    @PostMapping("/search")
    @Operation(summary = "Rechercher des bulletins de paie")
    @PreAuthorize("hasAuthority('PAIE_READ')")
    public ResponseEntity<Page<PaieResponseDto>> rechercher(
            @RequestBody(required = false) PaieSearchCriteria criteria,
            Pageable pageable) {
        return ResponseEntity.ok(paieService.search(criteria, pageable));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Supprimer un bulletin de paie")
    @ApiResponse(responseCode = "204")
    @ApiResponse(responseCode = "404")
    @PreAuthorize("hasAuthority('PAIE_DELETE')")
    public ResponseEntity<Void> supprimer(@PathVariable Long id) {
        paieService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/periodes")
    @Operation(summary = "Lister les mois qui contiennent de la paie, avec leur contenu résumé (sélecteur de mois de l'export)")
    @PreAuthorize("hasAuthority('PAIE_READ')")
    public ResponseEntity<List<PaiePeriodeResumeDto>> listerPeriodes() {
        return ResponseEntity.ok(paieService.findPeriodes(null));
    }

    @GetMapping("/materiel")
    @Operation(summary = "Lister les tableaux du parc matériel prévus (chantier, équipe, lignes) pour l'assistant d'export")
    @PreAuthorize("hasAuthority('PAIE_READ')")
    public ResponseEntity<List<PaieMaterielTableauDto>> listerTableauxMateriel() {
        return ResponseEntity.ok(paieService.findTableauxMateriel());
    }

    @PostMapping("/periodes/search")
    @Operation(summary = "Lister les mois qui contiennent de la paie sur un périmètre filtré (niveau « mois » de la vue Cartes)")
    @PreAuthorize("hasAuthority('PAIE_READ')")
    public ResponseEntity<List<PaiePeriodeResumeDto>> rechercherPeriodes(@RequestBody(required = false) PaieSearchCriteria criteria) {
        return ResponseEntity.ok(paieService.findPeriodes(criteria));
    }

    @PostMapping("/chantiers/search")
    @Operation(summary = "Lister les chantiers d'un mois, avec leurs équipes, sur un périmètre filtré (niveaux « chantier » et « équipe » de la vue Cartes)")
    @ApiResponse(responseCode = "400")
    @PreAuthorize("hasAuthority('PAIE_READ')")
    public ResponseEntity<List<PaieChantierPeriodeDto>> rechercherChantiersDeLaPeriode(@RequestBody PaieSearchCriteria criteria) {
        if (criteria == null || criteria.periode() == null) {
            throw new InvalidPeriodeException("La période est obligatoire (format aaaa-MM, ex. 2026-08)");
        }
        return ResponseEntity.ok(paieService.findChantiersDeLaPeriode(criteria.periode(), criteria));
    }

    @GetMapping("/chantiers")
    @Operation(summary = "Lister les chantiers d'un mois avec leurs équipes et effectifs (étape « détail par équipe » de l'export)")
    @PreAuthorize("hasAuthority('PAIE_READ')")
    public ResponseEntity<List<PaieChantierPeriodeDto>> listerChantiersDeLaPeriode(
            @Parameter(description = "Période au format aaaa-MM, ex. 2026-08", example = "2026-08")
            @RequestParam String periode) {
        return ResponseEntity.ok(paieService.findChantiersDeLaPeriode(parsePeriode(periode), null));
    }

    @PostMapping("/analytique")
    @Operation(summary = "Indicateurs du tableau de bord analytique d'un mois, sur un périmètre filtré (nom, CIN, chantiers, fonctions, équipes)")
    @ApiResponse(responseCode = "400")
    @PreAuthorize("hasAuthority('PAIE_READ')")
    public ResponseEntity<PaieAnalytiqueDto> analyser(@RequestBody PaieSearchCriteria criteria) {
        if (criteria == null || criteria.periode() == null) {
            throw new InvalidPeriodeException("La période est obligatoire (format aaaa-MM, ex. 2026-08)");
        }
        return ResponseEntity.ok(paieAnalytiqueService.analyser(criteria));
    }

    private YearMonth parsePeriode(String periode) {
        try {
            return YearMonth.parse(periode);
        } catch (DateTimeParseException e) {
            throw new InvalidPeriodeException("Période invalide, format attendu aaaa-MM (ex. 2026-08) : " + periode);
        }
    }
}

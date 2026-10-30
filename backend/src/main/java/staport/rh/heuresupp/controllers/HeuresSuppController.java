package staport.rh.heuresupp.controllers;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import staport.rh.heuresupp.dtos.request.HeuresSuppSearchCriteria;
import staport.rh.heuresupp.dtos.response.HeureSuppResponseDto;
import staport.rh.heuresupp.dtos.response.HeuresSuppAnalytiqueDto;
import staport.rh.heuresupp.dtos.request.HeuresSuppModificationDto;
import staport.rh.heuresupp.dtos.request.HeuresSuppCreationDto;
import staport.rh.heuresupp.dtos.request.HeuresSuppSuppressionMoisDto;
import staport.rh.heuresupp.services.HeuresSuppAnalytiqueService;
import staport.rh.heuresupp.services.interfaces.IHeuresSuppService;

import java.time.YearMonth;
import java.util.List;

@RestController
@RequestMapping("/heures-supp")
@Tag(name = "Heures supplémentaires", description = "Heures supplémentaires mensuelles et forfaits par chantier")
public class HeuresSuppController {

    private final IHeuresSuppService service;
    private final HeuresSuppAnalytiqueService analytique;

    public HeuresSuppController(IHeuresSuppService service, HeuresSuppAnalytiqueService analytique) {
        this.service = service;
        this.analytique = analytique;
    }

    @PostMapping("/search")
    @Operation(summary = "Rechercher les heures supplémentaires et forfaits d'un ou plusieurs mois")
    @PreAuthorize("hasAuthority('HEURES_SUP_READ') and hasAuthority('PAIE_READ')")
    public Page<HeureSuppResponseDto> rechercher(
            @Valid @RequestBody(required = false) HeuresSuppSearchCriteria criteres,
            @PageableDefault(size = 20, sort = "periode") Pageable pageable) {
        return service.rechercher(criteres, pageable);
    }

    @GetMapping("/periodes")
    @Operation(summary = "Lister les mois ayant des heures supplémentaires importées")
    @PreAuthorize("hasAuthority('HEURES_SUP_READ') and hasAuthority('PAIE_READ')")
    public List<YearMonth> periodes() {
        return analytique.periodes();
    }

    @GetMapping("/{id}")
    @Operation(summary = "Consulter une ligne d'heures supplémentaires")
    @PreAuthorize("hasAuthority('HEURES_SUP_READ') and hasAuthority('PAIE_READ')")
    public HeureSuppResponseDto rechercherParId(@PathVariable Long id) {
        return service.rechercherParId(id);
    }

    @PostMapping("/analytique")
    @Operation(summary = "Lire les indicateurs mensuels et répartitions par chantier et fonction")
    @PreAuthorize("hasAuthority('HEURES_SUP_READ') and hasAuthority('PAIE_READ')")
    public HeuresSuppAnalytiqueDto analyser(
            @Valid @RequestBody(required = false) HeuresSuppSearchCriteria criteres) {
        return analytique.analyser(criteres);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Modifier les heures ou le forfait d'une ligne")
    @PreAuthorize("hasAuthority('HEURES_SUP_IMPORT') and hasAuthority('PAIE_READ')")
    public HeureSuppResponseDto modifier(@PathVariable Long id, @Valid @RequestBody HeuresSuppModificationDto requete) {
        return service.modifier(id, requete);
    }

    @PostMapping
    @Operation(summary = "Ajouter une ligne manuellement pour un employé, un mois et un chantier")
    @PreAuthorize("hasAuthority('HEURES_SUP_IMPORT') and hasAuthority('PAIE_READ') and hasAuthority('EMPLOYEE_READ') and hasAuthority('CHANTIER_READ')")
    public HeureSuppResponseDto creer(@Valid @RequestBody HeuresSuppCreationDto requete) { return service.creer(requete); }

    @DeleteMapping("/{id}")
    @Operation(summary = "Supprimer une ligne d'heures supplémentaires")
    @PreAuthorize("hasAuthority('HEURES_SUP_DELETE') and hasAuthority('PAIE_READ')")
    public org.springframework.http.ResponseEntity<Void> supprimer(@PathVariable Long id) {
        service.supprimer(id);
        return org.springframework.http.ResponseEntity.noContent().build();
    }

    @org.springframework.web.bind.annotation.PostMapping("/suppression-mois")
    @Operation(summary = "Supprimer toutes les lignes d'un mois, tous chantiers confondus, après confirmation du nombre")
    @PreAuthorize("hasAuthority('HEURES_SUP_PURGE') and hasAuthority('PAIE_READ')")
    public long supprimerMois(@Valid @RequestBody HeuresSuppSuppressionMoisDto requete) {
        return service.supprimerMois(requete.periode(), requete.nombreAttendu());
    }
}

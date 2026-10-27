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
import staport.rh.heuresupp.dtos.request.HeuresSuppSearchCriteria;
import staport.rh.heuresupp.dtos.response.HeureSuppResponseDto;
import staport.rh.heuresupp.dtos.response.HeuresSuppAnalytiqueDto;
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

    @PostMapping("/analytique")
    @Operation(summary = "Lire les indicateurs mensuels et répartitions par chantier et fonction")
    @PreAuthorize("hasAuthority('HEURES_SUP_READ') and hasAuthority('PAIE_READ')")
    public HeuresSuppAnalytiqueDto analyser(
            @Valid @RequestBody(required = false) HeuresSuppSearchCriteria criteres) {
        return analytique.analyser(criteres);
    }
}

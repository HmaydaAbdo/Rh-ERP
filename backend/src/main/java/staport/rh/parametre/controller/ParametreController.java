package staport.rh.parametre.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import staport.rh.parametre.dtos.request.ParametreUpdateRequestDto;
import staport.rh.parametre.dtos.response.ParametreResponseDto;
import staport.rh.parametre.services.interfaces.IParametreService;

import java.util.List;

@RestController
@RequestMapping("/parametres")
@Tag(name = "Paramètres", description = "Valeurs de fonctionnement réglables par un administrateur (durées des sessions, règle des mots de passe...)")
public class ParametreController {

    private final IParametreService parametreService;

    public ParametreController(IParametreService parametreService) {
        this.parametreService = parametreService;
    }

    /** Le catalogue est fixe (quelques paramètres, jamais de saisie libre) : la liste n'est pas paginée. */
    @GetMapping
    @Operation(summary = "Lister les paramètres et leurs valeurs courantes")
    @PreAuthorize("hasAuthority('PARAMETRE_READ')")
    public ResponseEntity<List<ParametreResponseDto>> findAll() {
        return ResponseEntity.ok(parametreService.findAll());
    }

    @PutMapping("/{id}")
    @Operation(summary = "Modifier la valeur d'un paramètre")
    @ApiResponse(responseCode = "400", description = "Valeur d'un autre type, hors bornes ou expression cron invalide")
    @ApiResponse(responseCode = "404", description = "Le paramètre demandé n'existe pas dans le catalogue fixe.")
    @PreAuthorize("hasAuthority('PARAMETRE_WRITE')")
    public ResponseEntity<ParametreResponseDto> update(@PathVariable Long id, @Valid @RequestBody ParametreUpdateRequestDto dto) {
        return ResponseEntity.ok(parametreService.update(id, dto));
    }
}

package staport.rh.accueil.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import staport.rh.accueil.dtos.request.AccueilUpdateRequestDto;
import staport.rh.accueil.dtos.response.AccueilResponseDto;
import staport.rh.accueil.services.interfaces.IAccueilService;

@RestController
@RequestMapping("/accueil")
@Tag(name = "Accueil", description = "Indicateurs affichés sur l'écran d'accueil, propres à chaque utilisateur")
public class AccueilController {

    private final IAccueilService accueilService;

    public AccueilController(IAccueilService accueilService) {
        this.accueilService = accueilService;
    }

    @GetMapping
    @Operation(summary = "Lire l'accueil de l'utilisateur connecté (ses indicateurs et ceux qu'il peut choisir)")
    @PreAuthorize("hasAuthority('ACCUEIL_READ')")
    public ResponseEntity<AccueilResponseDto> lire(Authentication authentication) {
        return ResponseEntity.ok(accueilService.lire(authentication.getName()));
    }

    @PutMapping
    @Operation(summary = "Choisir et ordonner ses propres indicateurs")
    @ApiResponse(responseCode = "400", description = "Indicateur inconnu, en double ou non autorisé par les permissions de l'utilisateur")
    @ApiResponse(responseCode = "409", description = "L'accueil a été modifié depuis la lecture (version périmée)")
    @PreAuthorize("hasAuthority('ACCUEIL_WRITE')")
    public ResponseEntity<AccueilResponseDto> enregistrer(Authentication authentication, @Valid @RequestBody AccueilUpdateRequestDto dto) {
        return ResponseEntity.ok(accueilService.enregistrer(authentication.getName(), dto));
    }

    @DeleteMapping
    @Operation(summary = "Revenir à tous les indicateurs autorisés pour soi-même")
    @PreAuthorize("hasAuthority('ACCUEIL_WRITE')")
    public ResponseEntity<AccueilResponseDto> reinitialiser(Authentication authentication) {
        return ResponseEntity.ok(accueilService.reinitialiser(authentication.getName()));
    }

    @GetMapping("/utilisateurs/{id}")
    @Operation(summary = "Lire l'accueil d'un utilisateur")
    @ApiResponse(responseCode = "404", description = "Utilisateur introuvable")
    @PreAuthorize("hasAuthority('ACCUEIL_ADMIN')")
    public ResponseEntity<AccueilResponseDto> lireDe(@PathVariable Long id) {
        return ResponseEntity.ok(accueilService.lireDe(id));
    }

    @PutMapping("/utilisateurs/{id}")
    @Operation(summary = "Choisir et ordonner les indicateurs d'un utilisateur")
    @ApiResponse(responseCode = "400", description = "Indicateur inconnu, en double ou non autorisé par les permissions de cet utilisateur")
    @ApiResponse(responseCode = "404", description = "Utilisateur introuvable")
    @ApiResponse(responseCode = "409", description = "L'accueil a été modifié depuis la lecture (version périmée)")
    @PreAuthorize("hasAuthority('ACCUEIL_ADMIN')")
    public ResponseEntity<AccueilResponseDto> enregistrerDe(@PathVariable Long id, @Valid @RequestBody AccueilUpdateRequestDto dto) {
        return ResponseEntity.ok(accueilService.enregistrerDe(id, dto));
    }

    @DeleteMapping("/utilisateurs/{id}")
    @Operation(summary = "Rendre à un utilisateur tous les indicateurs que ses permissions autorisent")
    @ApiResponse(responseCode = "404", description = "Utilisateur introuvable")
    @PreAuthorize("hasAuthority('ACCUEIL_ADMIN')")
    public ResponseEntity<AccueilResponseDto> reinitialiserDe(@PathVariable Long id) {
        return ResponseEntity.ok(accueilService.reinitialiserDe(id));
    }
}

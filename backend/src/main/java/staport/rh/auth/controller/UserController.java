package staport.rh.auth.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import staport.rh.auth.dtos.request.AdminResetPasswordRequestDto;
import staport.rh.auth.dtos.request.DenyPermissionsRequestDto;
import staport.rh.auth.dtos.request.UserCreateRequestDto;
import staport.rh.auth.dtos.request.UserUpdateRequestDto;
import staport.rh.auth.dtos.response.UserResponseDto;
import staport.rh.auth.services.interfaces.IUserService;

import java.util.List;

/** Gestion des comptes utilisateurs — réservé à USER_MANAGE (voir conventions/security.md). */
@RestController
@Tag(name = "Utilisateurs", description = "Comptes de connexion, rôles et refus individuels")
@RequestMapping("/users")
@PreAuthorize("hasAuthority('USER_MANAGE')")
public class UserController {

    private final IUserService userService;

    public UserController(IUserService userService) {
        this.userService = userService;
    }

    @GetMapping
    @Operation(summary = "Lister les utilisateurs")
    public ResponseEntity<List<UserResponseDto>> findAll() {
        return ResponseEntity.ok(userService.findAll());
    }

    @GetMapping("/{id}")
    @Operation(summary = "Lire un utilisateur")
    public ResponseEntity<UserResponseDto> findById(@PathVariable Long id) {
        return ResponseEntity.ok(userService.findById(id));
    }

    @PostMapping
    @Operation(summary = "Créer un utilisateur")
    public ResponseEntity<UserResponseDto> create(@Valid @RequestBody UserCreateRequestDto dto) {
        return ResponseEntity.ok(userService.create(dto));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Modifier un utilisateur", description = "Désactiver un compte coupe ses sessions.")
    public ResponseEntity<UserResponseDto> update(@PathVariable Long id, @Valid @RequestBody UserUpdateRequestDto dto) {
        return ResponseEntity.ok(userService.update(id, dto));
    }

    @PutMapping("/{id}/permissions-refusees")
    @Operation(summary = "Définir les permissions refusées")
    public ResponseEntity<UserResponseDto> updateDeniedPermissions(
            @PathVariable Long id, @Valid @RequestBody DenyPermissionsRequestDto dto) {
        return ResponseEntity.ok(userService.updateDeniedPermissions(id, dto));
    }

    @PostMapping("/{id}/reset-password")
    @Operation(summary = "Réinitialiser le mot de passe", description = "Coupe toutes les sessions du compte.")
    @ApiResponse(responseCode = "204", description = "Mot de passe changé")
    @ApiResponse(responseCode = "400", description = "Mot de passe non conforme à la règle")
    public ResponseEntity<Void> adminResetPassword(@PathVariable Long id, @Valid @RequestBody AdminResetPasswordRequestDto dto) {
        userService.adminResetPassword(id, dto);
        return ResponseEntity.noContent().build();
    }
}

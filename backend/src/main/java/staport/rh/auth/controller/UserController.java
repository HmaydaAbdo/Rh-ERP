package staport.rh.auth.controller;

import io.swagger.v3.oas.annotations.Operation;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import staport.rh.auth.dtos.request.UserSearchCriteria;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
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

    @PostMapping("/search")
    @Operation(summary = "Rechercher des utilisateurs", description = "Pagination serveur ; tri sur username, email ou actif.")
    public ResponseEntity<Page<UserResponseDto>> search(@Valid @RequestBody(required = false) UserSearchCriteria criteria,
                                                         @PageableDefault(size = 20, sort = "username") Pageable pageable) {
        return ResponseEntity.ok(userService.search(criteria, pageable));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Lire un utilisateur")
    public ResponseEntity<UserResponseDto> findById(@PathVariable Long id) {
        return ResponseEntity.ok(userService.findById(id));
    }

    @PostMapping
    @Operation(summary = "Créer un utilisateur")
    @ApiResponse(responseCode = "201")
    public ResponseEntity<UserResponseDto> create(@Valid @RequestBody UserCreateRequestDto dto) {
        return ResponseEntity.status(HttpStatus.CREATED).body(userService.create(dto));
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

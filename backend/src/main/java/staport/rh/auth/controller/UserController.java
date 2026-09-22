package staport.rh.auth.controller;

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
@RequestMapping("/users")
@PreAuthorize("hasAuthority('USER_MANAGE')")
public class UserController {

    private final IUserService userService;

    public UserController(IUserService userService) {
        this.userService = userService;
    }

    @GetMapping
    public ResponseEntity<List<UserResponseDto>> findAll() {
        return ResponseEntity.ok(userService.findAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<UserResponseDto> findById(@PathVariable Long id) {
        return ResponseEntity.ok(userService.findById(id));
    }

    @PostMapping
    public ResponseEntity<UserResponseDto> create(@Valid @RequestBody UserCreateRequestDto dto) {
        return ResponseEntity.ok(userService.create(dto));
    }

    @PutMapping("/{id}")
    public ResponseEntity<UserResponseDto> update(@PathVariable Long id, @Valid @RequestBody UserUpdateRequestDto dto) {
        return ResponseEntity.ok(userService.update(id, dto));
    }

    @PutMapping("/{id}/permissions-refusees")
    public ResponseEntity<UserResponseDto> updateDeniedPermissions(
            @PathVariable Long id, @Valid @RequestBody DenyPermissionsRequestDto dto) {
        return ResponseEntity.ok(userService.updateDeniedPermissions(id, dto));
    }

    @PostMapping("/{id}/reset-password")
    public ResponseEntity<Void> adminResetPassword(@PathVariable Long id, @Valid @RequestBody AdminResetPasswordRequestDto dto) {
        userService.adminResetPassword(id, dto);
        return ResponseEntity.noContent().build();
    }
}

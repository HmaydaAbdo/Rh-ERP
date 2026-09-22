package staport.rh.auth.controller;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import staport.rh.auth.dtos.request.RoleCreateRequestDto;
import staport.rh.auth.dtos.request.RoleUpdateRequestDto;
import staport.rh.auth.dtos.response.PermissionResponseDto;
import staport.rh.auth.dtos.response.RoleResponseDto;
import staport.rh.auth.services.interfaces.IRoleService;

import java.util.List;

/** Gestion des rôles et du catalogue de permissions — réservé à ROLE_MANAGE. */
@RestController
@PreAuthorize("hasAuthority('ROLE_MANAGE')")
public class RoleController {

    private final IRoleService roleService;

    public RoleController(IRoleService roleService) {
        this.roleService = roleService;
    }

    @GetMapping("/roles")
    public ResponseEntity<List<RoleResponseDto>> findAll() {
        return ResponseEntity.ok(roleService.findAll());
    }

    @GetMapping("/roles/{id}")
    public ResponseEntity<RoleResponseDto> findById(@PathVariable Long id) {
        return ResponseEntity.ok(roleService.findById(id));
    }

    @PostMapping("/roles")
    public ResponseEntity<RoleResponseDto> create(@Valid @RequestBody RoleCreateRequestDto dto) {
        return ResponseEntity.ok(roleService.create(dto));
    }

    @PutMapping("/roles/{id}")
    public ResponseEntity<RoleResponseDto> update(@PathVariable Long id, @Valid @RequestBody RoleUpdateRequestDto dto) {
        return ResponseEntity.ok(roleService.update(id, dto));
    }

    @DeleteMapping("/roles/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        roleService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/permissions")
    public ResponseEntity<List<PermissionResponseDto>> findAllPermissions() {
        return ResponseEntity.ok(roleService.findAllPermissions());
    }
}

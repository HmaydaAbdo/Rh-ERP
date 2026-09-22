package staport.rh.auth.dtos.response;

import java.util.Set;

public record RoleResponseDto(
        Long id,
        String nom,
        String description,
        Set<PermissionResponseDto> permissions
) {
}

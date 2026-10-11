package staport.rh.auth.dtos.response;

import java.util.Set;

public record UserResponseDto(
        Long id,
        Long version,
        String username,
        String email,
        boolean actif,
        EmployeeSummaryDto employee,
        Set<RoleSummaryDto> roles,
        Set<PermissionResponseDto> permissionsRefusees,
        Set<String> permissionsEffectives
) {
}

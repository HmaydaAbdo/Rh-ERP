package staport.rh.auth.dtos.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.Set;

public record RoleUpdateRequestDto(
        @NotNull Long version,
        @NotBlank @Size(min = 2, max = 50) String nom,
        @Size(max = 255) String description,
        @NotNull Set<Long> permissionIds
) {
}

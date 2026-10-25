package staport.rh.auth.dtos.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.util.Set;

/** Remplace intégralement l'ensemble des deny overrides de l'utilisateur (pas un ajout incrémental). */
public record DenyPermissionsRequestDto(
        @NotNull Long version,
        @NotNull Set<@NotNull @Positive Long> permissionIds
) {
}

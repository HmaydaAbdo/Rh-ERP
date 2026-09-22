package staport.rh.auth.dtos.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.Set;

public record UserUpdateRequestDto(
        @NotBlank @Email String email,
        boolean actif,
        Long employeeId,
        @NotNull Set<Long> roleIds
) {
}

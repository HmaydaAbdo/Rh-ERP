package staport.rh.auth.dtos.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.util.Set;

public record UserUpdateRequestDto(
        @NotNull Long version,
        @NotBlank @Email @Size(max = 255) String email,
        boolean actif,
        Long employeeId,
        @NotNull Set<@NotNull @Positive Long> roleIds
) {
    public UserUpdateRequestDto {
        email = email == null ? null : email.strip();
    }
}

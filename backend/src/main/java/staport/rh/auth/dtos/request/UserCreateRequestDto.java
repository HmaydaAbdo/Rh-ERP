package staport.rh.auth.dtos.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.util.Set;

public record UserCreateRequestDto(
        @NotBlank @Size(min = 3, max = 50) String username,
        @NotBlank @Email @Size(max = 255) String email,
        @NotBlank @Size(max = 100) String motDePasse,
        Long employeeId,
        @NotNull Set<@NotNull @Positive Long> roleIds
) {
    public UserCreateRequestDto {
        username = username == null ? null : username.strip();
        email = email == null ? null : email.strip();
    }
}

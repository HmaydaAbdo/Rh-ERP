package staport.rh.auth.dtos.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AdminResetPasswordRequestDto(
        @NotBlank @Size(min = 8, max = 100) String nouveauMotDePasse
) {
}

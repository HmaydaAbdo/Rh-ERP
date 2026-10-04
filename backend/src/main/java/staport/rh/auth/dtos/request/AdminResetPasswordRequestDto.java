package staport.rh.auth.dtos.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AdminResetPasswordRequestDto(
        @NotBlank @Size(max = 100) String nouveauMotDePasse
) {
}

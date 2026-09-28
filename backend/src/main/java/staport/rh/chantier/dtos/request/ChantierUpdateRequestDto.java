package staport.rh.chantier.dtos.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ChantierUpdateRequestDto(
        @NotBlank
        @Size(max = 100)
        String code,

        @NotBlank
        @Size(max = 500)
        String designation,

        @Size(max = 255)
        String nom,

        @NotNull
        Boolean actif
) {
}

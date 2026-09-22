package staport.rh.function.dtos.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record FunctionUpdateRequestDto(
        @NotBlank
        @Size(max = 100)
        String libelle
) {
}

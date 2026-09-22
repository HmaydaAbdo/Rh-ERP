package staport.rh.function.dtos.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record FunctionCreateRequestDto(
        @NotBlank
        @Size(max = 100)
        String libelle
) {
}

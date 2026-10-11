package staport.rh.function.dtos.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record FunctionUpdateRequestDto(
        @NotNull Long version,

        @NotBlank
        @Size(max = 100)
        String libelle
) {
}

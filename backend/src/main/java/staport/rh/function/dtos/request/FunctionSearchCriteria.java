package staport.rh.function.dtos.request;

import jakarta.validation.constraints.Size;

public record FunctionSearchCriteria(
        @Size(max = 100) String libelle
) {
}

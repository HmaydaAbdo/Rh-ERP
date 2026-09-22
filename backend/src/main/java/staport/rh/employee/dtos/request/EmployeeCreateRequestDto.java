package staport.rh.employee.dtos.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

public record EmployeeCreateRequestDto(
        @NotBlank
        @Size(max = 150)
        String nomPrenom,

        @NotBlank
        @Size(max = 30)
        String cin,

        @NotNull
        @Past
        LocalDate dateNaissance,

        @NotNull
        LocalDate dateEmbauche,

        @NotNull
        Long fonctionId,

        @NotNull
        Long chantierId
) {
}

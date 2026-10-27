package staport.rh.chantier.dtos.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.Digits;
import staport.rh.chantier.entities.NatureChantier;
import java.math.BigDecimal;

public record ChantierCreateRequestDto(
        @NotBlank
        @Size(max = 100)
        String code,

        @NotBlank
        @Size(max = 500)
        String designation,

        @Size(max = 255)
        String nom,
        @NotNull NatureChantier nature,
        @Size(max = 2048) String localisation,
        @DecimalMin("-90") @DecimalMax("90") @Digits(integer = 3, fraction = 8) BigDecimal latitude,
        @DecimalMin("-180") @DecimalMax("180") @Digits(integer = 3, fraction = 8) BigDecimal longitude,
        @NotNull Boolean afficherSurCarte
) {
}

package staport.rh.paie.dtos.request;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.YearMonth;

/**
 * Ne porte pas {@code salaireTotal} : ce champ n'est jamais saisi, il est calculé côté serveur
 * (salaireMensuel + primeRoulageOrdinaire + primeRoulageDimanche) — voir {@link staport.rh.paie.entities.Paie#calculerSalaireTotal()}.
 */
public record PaieCreateRequestDto(
        @NotNull
        Long employeeId,

        @NotNull
        YearMonth periode,

        @NotNull
        Long fonctionId,

        @NotNull
        Long chantierId,

        @Size(max = 50)
        String equipe,

        @NotNull
        @Min(0)
        Integer nombreJoursTravailles,

        @DecimalMin(value = "0", inclusive = true)
        BigDecimal joursRecuperationOuvrable,

        @DecimalMin(value = "0", inclusive = true)
        BigDecimal joursRecuperationDimanche,

        @NotNull
        @PositiveOrZero
        BigDecimal salaireMensuel,

        @PositiveOrZero
        BigDecimal primeRoulageOrdinaire,

        @PositiveOrZero
        BigDecimal primeRoulageDimanche,

        @Size(max = 255)
        String observation
) {
}

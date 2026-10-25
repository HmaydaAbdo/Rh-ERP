package staport.rh.paie.dtos.request;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.YearMonth;


public record PaieCreateRequestDto(
        @NotNull
        Long employeeId,

        @NotNull
        YearMonth periode,

        @NotNull
        Long fonctionId,

        @NotNull
        Long chantierId,

        Long equipeId,

        @NotNull
        @DecimalMin(value = "0", inclusive = true)
        @Digits(integer = 3, fraction = 2)
        BigDecimal nombreJoursTravailles,

        @DecimalMin(value = "0", inclusive = true)
        @Digits(integer = 3, fraction = 2)
        BigDecimal joursRecuperationOuvrable,

        @DecimalMin(value = "0", inclusive = true)
        @Digits(integer = 3, fraction = 2)
        BigDecimal joursRecuperationDimanche,

        @NotNull
        @PositiveOrZero
        @Digits(integer = 8, fraction = 2)
        BigDecimal salaireMensuel,

        @PositiveOrZero
        @Digits(integer = 8, fraction = 2)
        BigDecimal primeRoulageOrdinaire,

        @PositiveOrZero
        @Digits(integer = 8, fraction = 2)
        BigDecimal primeRoulageDimanche,

        @NotNull
        @PositiveOrZero
        @Digits(integer = 8, fraction = 2)
        BigDecimal salaireTotal,

        @Size(max = 255)
        String observation
) {
}

package staport.rh.heuresupp.dtos.request;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.YearMonth;

public record HeuresSuppCreationDto(
        @NotNull Long employeeId,
        @NotNull YearMonth periode,
        @NotNull Long chantierId,
        @DecimalMin("0.0") @Digits(integer = 7, fraction = 1) BigDecimal heuresSupplementaires,
        @DecimalMin("0.00") @Digits(integer = 14, fraction = 2) BigDecimal forfaitDh
) { }

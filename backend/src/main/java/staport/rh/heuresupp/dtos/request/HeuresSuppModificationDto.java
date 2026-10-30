package staport.rh.heuresupp.dtos.request;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record HeuresSuppModificationDto(
        @NotNull Long version,
        @DecimalMin("0.0") @Digits(integer = 7, fraction = 1) BigDecimal heuresSupplementaires,
        @DecimalMin("0.00") @Digits(integer = 14, fraction = 2) BigDecimal forfaitDh
) { }

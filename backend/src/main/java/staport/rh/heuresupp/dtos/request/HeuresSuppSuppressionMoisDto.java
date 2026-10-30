package staport.rh.heuresupp.dtos.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.time.YearMonth;

public record HeuresSuppSuppressionMoisDto(@NotNull YearMonth periode, @Min(0) long nombreAttendu) { }

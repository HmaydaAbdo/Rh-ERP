package staport.rh.heuresupp.imports;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;

/** Forfaits saisis séparément des lignes P/H, identifiés par le CIN. */
public record HeuresSuppImportForfaitsDto(@Valid @Size(max = 500) List<Forfait> forfaits) {

    public HeuresSuppImportForfaitsDto {
        forfaits = forfaits == null ? List.of() : List.copyOf(forfaits);
    }

    public record Forfait(
            @NotBlank @Size(max = 30) String cin,
            @NotNull @DecimalMin("0.00") @Digits(integer = 14, fraction = 2) BigDecimal montantDh
    ) {
    }
}

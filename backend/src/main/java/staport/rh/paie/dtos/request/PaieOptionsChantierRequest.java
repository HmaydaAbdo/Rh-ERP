package staport.rh.paie.dtos.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.YearMonth;

/** Recherche paginée des chantiers ayant une paie pour le mois choisi. */
public record PaieOptionsChantierRequest(
        @NotNull YearMonth periode,
        @Size(max = 100) String recherche
) {
}

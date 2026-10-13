package staport.rh.paie.dtos.request;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.YearMonth;
import java.util.List;

/** Recherche paginée des équipes ayant une paie sur les chantiers choisis pour le mois. */
public record PaieOptionsEquipeRequest(
        @NotNull YearMonth periode,
        @NotEmpty @Size(max = 500) List<@NotNull Long> chantierIds,
        @Size(max = 100) String recherche
) {
}

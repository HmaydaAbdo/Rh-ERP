package staport.rh.heuresupp.dtos.request;

import jakarta.validation.constraints.Size;

import java.time.YearMonth;
import java.util.List;

/** Filtres de consultation des heures et forfaits conservés dans l'URL de la vue Tabulaire. */
public record HeuresSuppSearchCriteria(
        YearMonth periode,
        @Size(max = 500) List<Long> chantierIds,
        @Size(max = 500) List<Long> equipeIds,
        @Size(max = 500) List<Long> fonctionIds,
        @Size(max = 30) String cin,
        @Size(max = 150) String nomPrenom
) {
}

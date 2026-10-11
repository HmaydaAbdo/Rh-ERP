package staport.rh.paie.dtos.request;

import jakarta.validation.constraints.Size;

import java.time.YearMonth;
import java.util.List;

/** {@code fonctionIds}/{@code chantierIds}/{@code equipeIds} : filtres de liste multi-valeurs (voir
 * {@code conventions/frontend.md}, section Sélecteurs). {@code null} ou vide = pas de filtre sur
 * cette dimension. Les longueurs sont bornées comme les champs qu'elles filtrent. */
public record PaieSearchCriteria(
        @Size(max = 30) String cin,
        @Size(max = 150) String nomPrenom,
        YearMonth periode,
        @Size(max = 500) List<Long> fonctionIds,
        @Size(max = 500) List<Long> chantierIds,
        @Size(max = 500) List<Long> equipeIds
) {
}

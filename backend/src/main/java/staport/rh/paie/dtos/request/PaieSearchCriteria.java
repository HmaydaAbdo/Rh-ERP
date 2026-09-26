package staport.rh.paie.dtos.request;

import java.time.YearMonth;
import java.util.List;

/** {@code fonctionIds}/{@code chantierIds} : filtres de liste multi-valeurs (voir
 * {@code conventions/frontend.md}, section Sélecteurs). {@code null} ou vide = pas de filtre sur
 * cette dimension. */
public record PaieSearchCriteria(
        String cin,
        String nomPrenom,
        YearMonth periode,
        List<Long> fonctionIds,
        List<Long> chantierIds,
        String equipe
) {
}

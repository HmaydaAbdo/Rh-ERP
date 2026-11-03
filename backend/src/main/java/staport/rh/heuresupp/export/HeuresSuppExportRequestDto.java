package staport.rh.heuresupp.export;

import jakarta.validation.constraints.Size;
import staport.rh.heuresupp.dtos.request.HeuresSuppSearchCriteria;

import java.time.YearMonth;
import java.util.List;

/**
 * Filtres, recherche et tri de la vue Tabulaire : l'export couvre toutes les lignes du périmètre, pas la page affichée.
 * Le tri s'écrit « propriété,asc|desc » ; absent, le mois décroissant s'applique.
 */
public record HeuresSuppExportRequestDto(
        YearMonth periode,
        @Size(max = 500) List<Long> chantierIds,
        @Size(max = 500) List<Long> equipeIds,
        @Size(max = 500) List<Long> fonctionIds,
        @Size(max = 30) String cin,
        @Size(max = 150) String nomPrenom,
        @Size(max = 60) String tri,
        @Size(max = 60) List<YearMonth> periodes
) {

    public HeuresSuppExportRequestDto(YearMonth periode, List<Long> chantierIds, List<Long> equipeIds, List<Long> fonctionIds,
                                      String cin, String nomPrenom, String tri) {
        this(periode, chantierIds, equipeIds, fonctionIds, cin, nomPrenom, tri, null);
    }

    /** Les mois demandés : la liste `periodes` si elle est fournie, sinon le mois unique. */
    public List<YearMonth> moisDemandes() {
        if (periodes != null && !periodes.isEmpty()) {
            return periodes.stream().distinct().sorted().toList();
        }
        return periode == null ? List.of() : List.of(periode);
    }

    public HeuresSuppSearchCriteria criteres() {
        return new HeuresSuppSearchCriteria(periode, chantierIds, equipeIds, fonctionIds, cin, nomPrenom, periodes);
    }
}

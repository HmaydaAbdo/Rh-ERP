package staport.rh.employee.dtos.request;

import staport.rh.employee.entities.EmployeeStatut;

import java.util.List;

/** {@code fonctionIds}/{@code chantierIds} : filtres de liste multi-valeurs (voir
 * {@code conventions/frontend.md}, section Sélecteurs — un filtre de liste sur une dimension à
 * cardinalité réelle est un multiselect, jamais une sélection unique). {@code null} ou vide = pas de
 * filtre sur cette dimension, jamais interprété comme "aucun résultat". */
public record EmployeeSearchCriteria(
        String nomPrenom,
        String cin,
        List<Long> fonctionIds,
        List<Long> chantierIds,
        EmployeeStatut statut
) {
}

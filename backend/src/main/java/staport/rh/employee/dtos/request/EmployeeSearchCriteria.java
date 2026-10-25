package staport.rh.employee.dtos.request;

import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import staport.rh.employee.entities.EmployeeStatut;

import java.util.List;

/** {@code fonctionIds}/{@code chantierIds} : filtres de liste multi-valeurs (voir
 * {@code conventions/frontend.md}, section Sélecteurs — un filtre de liste sur une dimension à
 * cardinalité réelle est un multiselect, jamais une sélection unique). {@code null} ou vide = pas de
 * filtre sur cette dimension, jamais interprété comme "aucun résultat". Dans {@code equipeIds}, {@code 0} désigne les
 * employés <strong>sans équipe</strong> (même convention que la paie). */
public record EmployeeSearchCriteria(
        @Size(max = 150) String nomPrenom,
        @Size(max = 30) String cin,
        @Size(max = 500) List<@NotNull @Positive Long> fonctionIds,
        @Size(max = 500) List<@NotNull @PositiveOrZero Long> chantierIds,
        @Size(max = 500) List<@NotNull @PositiveOrZero Long> equipeIds,
        EmployeeStatut statut
) {
}

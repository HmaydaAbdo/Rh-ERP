package staport.rh.equipe.dtos.request;

import jakarta.validation.constraints.Size;

/** {@code code}/{@code libelle} : filtres précis, combinés en ET (liste d'administration).
 * {@code recherche} : recherche libre du sélecteur générique, en OU entre code et libellé — un
 * utilisateur tape ce qu'il voit, que ce soit le code ou le libellé de l'équipe. */
public record EquipeSearchCriteria(
        @Size(max = 50) String code,
        @Size(max = 100) String libelle,
        @Size(max = 100) String recherche
) {
}

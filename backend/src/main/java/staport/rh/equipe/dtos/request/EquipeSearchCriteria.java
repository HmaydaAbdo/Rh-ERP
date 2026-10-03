package staport.rh.equipe.dtos.request;

/** {@code code}/{@code libelle} : filtres précis, combinés en ET (liste d'administration).
 * {@code recherche} : recherche libre du sélecteur générique, en OU entre code et libellé — un
 * utilisateur tape ce qu'il voit, que ce soit le code ou le libellé de l'équipe. */
public record EquipeSearchCriteria(
        String code,
        String libelle,
        String recherche
) {
}

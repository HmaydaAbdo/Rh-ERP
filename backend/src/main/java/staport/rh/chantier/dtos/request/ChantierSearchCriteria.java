package staport.rh.chantier.dtos.request;

import jakarta.validation.constraints.Size;

/** {@code code}/{@code designation} : filtres précis, combinés en ET avec les autres critères — la
 * liste chantier (UI d'administration) les expose comme 2 champs de filtre indépendants, un chantier
 * doit alors correspondre aux deux à la fois. {@code recherche} : recherche libre pour le sélecteur
 * générique (voir {@code ChantierReferenceService}) — combinée en OU entre code, nom et désignation
 * (un utilisateur tape ce qu'il voit, que ce soit le code ou le nom du chantier), jamais mélangée
 * avec {@code code}/{@code designation} pour ne pas changer le comportement du filtre précis de la
 * liste chantier. */
public record ChantierSearchCriteria(
        @Size(max = 100) String code,
        @Size(max = 500) String designation,
        @Size(max = 500) String recherche,
        Boolean actif
) {
}

package staport.rh.parametre.dtos.response;

import staport.rh.parametre.entities.TypeParametre;

/** Un paramètre tel que l'écran l'affiche : sa valeur courante et ce qui permet de la saisir correctement. */
public record ParametreResponseDto(
        Long id,
        Long version,
        String cle,
        String libelle,
        String description,
        TypeParametre type,
        String unite,
        Long minimum,
        Long maximum,
        String valeur
) {
}

package staport.rh.auth.dtos.request;

import jakarta.validation.constraints.Size;

/** Filtres de la liste des rôles : texte « contient » sur le nom et la description. Un champ absent ou vide est ignoré. */
public record RoleSearchCriteria(
        @Size(max = 50) String nom,
        @Size(max = 255) String description
) {
}

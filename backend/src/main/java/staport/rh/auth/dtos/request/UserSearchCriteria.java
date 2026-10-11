package staport.rh.auth.dtos.request;

import jakarta.validation.constraints.Size;

/** Filtres de la liste des comptes : texte « contient » sur l'identifiant et l'e-mail, statut exact. Un champ absent ou vide est ignoré. */
public record UserSearchCriteria(
        @Size(max = 50) String username,
        @Size(max = 255) String email,
        Boolean actif
) {
}

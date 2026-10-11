package staport.rh.parametre.dtos.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Nouvelle valeur d'un paramètre, en texte : le type et les bornes sont ceux de sa clé ({@code CleParametre}). */
public record ParametreUpdateRequestDto(
        @NotBlank @Size(max = 255) String valeur
) {
}

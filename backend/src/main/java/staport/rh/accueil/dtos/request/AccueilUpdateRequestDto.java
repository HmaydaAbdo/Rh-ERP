package staport.rh.accueil.dtos.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * Indicateurs à afficher, dans l'ordre. {@code version} est celle de la dernière lecture ; elle est absente tant que l'accueil n'a
 * jamais été personnalisé.
 */
public record AccueilUpdateRequestDto(
        Long version,
        @NotNull @Size(max = 20) List<@NotBlank @Size(max = 50) String> indicateurs
) {
}

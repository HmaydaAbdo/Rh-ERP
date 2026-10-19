package staport.rh.paie.imports;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * Les départs que l'utilisateur confirme au moment d'importer, chacun avec son motif (« STC », ou saisi pour un absent).
 * Un départ proposé par l'analyse et absent de cette liste n'est pas enregistré : l'employé reste actif.
 */
public record PaieImportDepartsDto(@Valid List<Depart> departs) {

    public PaieImportDepartsDto {
        departs = departs == null ? List.of() : List.copyOf(departs);
    }

    public record Depart(@NotNull Long employeId, @NotBlank @Size(max = 255) String motif) {
    }
}

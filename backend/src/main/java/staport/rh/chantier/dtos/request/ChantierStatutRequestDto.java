package staport.rh.chantier.dtos.request;

import jakarta.validation.constraints.NotNull;

/** Le changement de statut conserve la qualification géographique, y compris avant qualification. */
public record ChantierStatutRequestDto(@NotNull Long version, @NotNull Boolean actif) {}

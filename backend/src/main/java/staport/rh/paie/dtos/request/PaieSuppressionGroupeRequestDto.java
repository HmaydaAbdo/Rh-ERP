package staport.rh.paie.dtos.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

/**
 * Suppression d'un groupe de bulletins : ceux que décrivent {@code criteres} (dont le mois est obligatoire) — le même
 * périmètre que la carte qui a déclenché l'action. {@code nombreAttendu} est le nombre que l'utilisateur a confirmé : si
 * le groupe en compte un autre au moment de supprimer, rien n'est supprimé.
 */
public record PaieSuppressionGroupeRequestDto(
        @NotNull @Valid PaieSearchCriteria criteres,
        @NotNull @PositiveOrZero Long nombreAttendu
) {
}

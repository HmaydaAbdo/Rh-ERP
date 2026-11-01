package staport.rh.accueil.dtos.response;

import java.util.List;

/**
 * L'accueil d'un utilisateur : les indicateurs affichés dans l'ordre, et ceux que ses permissions lui permettent de choisir.
 * {@code personnalise} est faux tant qu'aucun choix n'est enregistré ; dans ce cas {@code version} est absente et l'accueil montre
 * tous les indicateurs autorisés.
 */
public record AccueilResponseDto(
        Long version,
        boolean personnalise,
        List<String> indicateurs,
        List<IndicateurDisponibleDto> disponibles
) {
}

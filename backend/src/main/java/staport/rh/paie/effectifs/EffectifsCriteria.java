package staport.rh.paie.effectifs;

import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * Périmètre des tendances d'effectifs : chantiers, fonctions et équipes <strong>du bulletin du mois</strong> (où l'employé
 * était payé ce mois-là). {@code null} ou vide = pas de filtre ; dans {@code equipeIds}, {@code 0} = sans équipe.
 */
public record EffectifsCriteria(
        @Size(max = 500) List<Long> chantierIds,
        @Size(max = 500) List<Long> fonctionIds,
        @Size(max = 500) List<Long> equipeIds
) {
}

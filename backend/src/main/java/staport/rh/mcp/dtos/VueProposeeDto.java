package staport.rh.mcp.dtos;

import java.util.Map;

/**
 * Vue partagée que l'assistant propose d'ouvrir (docs/ia.md, § 6) : un module, une de ses trois vues, et les paramètres
 * d'URL que cette vue lit déjà ({@code periode}, {@code chantierIds}, {@code equipeIds}, {@code fonctionIds},
 * {@code nom}, {@code statut}, {@code code}). Angular la traduit en route connue et ses gardes s'appliquent ; elle
 * n'accorde aucun droit.
 *
 * @param module     {@code paie}, {@code employees}, {@code chantiers}, {@code equipes} ou {@code functions}
 * @param vue        {@code tabulaire}, {@code cartes} ou {@code analytique}
 * @param parametres paramètres d'URL, valeurs déjà au format de l'URL (identifiants séparés par des virgules)
 */
public record VueProposeeDto(String module, String vue, Map<String, String> parametres) {

    public VueProposeeDto {
        parametres = Map.copyOf(parametres);
    }

    public Map<String, Object> enJson() {
        return Map.of("module", module, "vue", vue, "parametres", parametres);
    }
}

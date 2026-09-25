package staport.rh.paie.report;

import java.util.List;

/** Sous-section "équipe" d'un chantier. {@code titre} est déjà formaté (ex. "ÉQUIPE : ÉLECTRICITÉ"). */
public record EquipeRapportVue(
        String nom,
        String titre,
        List<LigneVue> lignes,
        TotauxVue totaux,
        List<EffectifFonctionVue> effectifParFonction
) {
}
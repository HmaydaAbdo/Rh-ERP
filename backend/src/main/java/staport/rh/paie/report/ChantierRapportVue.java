package staport.rh.paie.report;

import java.util.List;

/** Section "chantier" du rapport, avec ses sous-sections équipe. {@code titre} est déjà formaté
 * (ex. "CHANTIER : C168"). */
public record ChantierRapportVue(
        String code,
        String titre,
        List<LigneVue> lignes,
        TotauxVue totaux,
        List<EffectifFonctionVue> effectifParFonction,
        List<EquipeRapportVue> equipes
) {
}
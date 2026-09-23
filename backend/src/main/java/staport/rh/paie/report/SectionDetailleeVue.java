package staport.rh.paie.report;

import java.util.List;

/**
 * Une section du rapport détaillé : GLB, un chantier, ou une équipe d'un chantier. Les équipes d'un
 * chantier sont portées par {@code sousSections} — le template les rend à la suite du chantier, en
 * sections de même niveau (une par page), pas imbriquées.
 * {@code variation} vaut {@code null} quand le mois précédent est introuvable ou de total nul.
 */
public record SectionDetailleeVue(
        String titre,
        int effectif,
        List<LigneVue> lignes,
        String totalGeneral,
        String totalMoisPrecedent,
        String variation,
        List<EffectifFonctionVue> effectifParFonction,
        List<SectionDetailleeVue> sousSections
) {
}
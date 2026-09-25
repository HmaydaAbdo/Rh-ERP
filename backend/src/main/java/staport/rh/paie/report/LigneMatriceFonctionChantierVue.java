package staport.rh.paie.report;

/** Une ligne de la matrice Fonction × Chantier (effectif + STC) — table plutôt que heatmap, la
 * cardinalité chantier/fonction d'une PME BTP restant lisible en tableau (voir README du module). */
record LigneMatriceFonctionChantierVue(
        String chantier,
        String fonction,
        int effectif,
        int stc
) {
}

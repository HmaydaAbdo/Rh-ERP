package staport.rh.paie.report;

import java.util.List;

/** Racine de la vue-modèle du rapport PDF BI — voir {@code docs/report/README.md} pour le modèle
 * analytique complet (fait, dimensions, mesures, grain).
 *
 * <p>{@code chantiers} : TOUS les chantiers du périmètre, triés par masse décroissante — chacun a
 * désormais son propre chapitre romain, qu'il ait ou non une équipe détaillée (voir
 * {@code ChantierBiVue.avecDetailEquipe} et {@code evolution-rapport/rapport-v2.md} pour la décision qui a
 * mis fin à l'ancien chapitre final consolidé "Chantiers à effectif réduit"). */
record RapportBiVue(
        String periodeLibelle,
        List<String> filtresActifs,
        SyntheseGlobaleVue synthese,
        List<ChantierBiVue> chantiers
) {
}

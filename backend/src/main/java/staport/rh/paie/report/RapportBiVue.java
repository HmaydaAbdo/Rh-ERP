package staport.rh.paie.report;

import java.util.List;

/** Racine de la vue-modèle du rapport PDF BI — voir {@code docs/report/README.md} pour le modèle
 * analytique complet (fait, dimensions, mesures, grain). */
record RapportBiVue(
        String periodeLibelle,
        String dateGeneration,
        List<String> filtresActifs,
        SyntheseGlobaleVue synthese,
        List<LigneStcBean> stc,
        List<ChantierBiVue> chantiers
) {
}

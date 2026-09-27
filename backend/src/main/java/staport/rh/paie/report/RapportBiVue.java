package staport.rh.paie.report;

import java.util.List;

/** Racine de la vue-modèle du rapport PDF BI — voir {@code docs/report/README.md} pour le modèle
 * analytique complet (fait, dimensions, mesures, grain).
 *
 * <p>{@code chantiers} : TOUS les chantiers du périmètre, réordonnés — les chantiers "détaillés"
 * ({@code !compact()}, toujours triés par masse décroissante) d'abord, puis les chantiers "compacts"
 * (masse décroissante aussi, entre eux) à la fin (voir {@code PaieBiReportBuilder}) — cet ordre est ce
 * qui permet à {@code PaieReportPdfService}/{@code rapport.jrxml} de donner à chaque chantier détaillé
 * son propre chapitre romain, PUIS un seul chapitre final consolidant tous les chantiers compacts,
 * sans avoir à re-trier la liste. {@code repartitionChantiersCompacts} : UNE SEULE répartition
 * (masse/effectif/STC, même forme que {@code SyntheseGlobaleVue.repartitionChantier}) couvrant TOUS
 * les chantiers compacts — alimente l'unique graphique à barres groupées de ce chapitre final (voir
 * {@code PaieReportGroupedChartCustomizer}), jamais un graphique par chantier compact. */
record RapportBiVue(
        String periodeLibelle,
        String dateGeneration,
        List<String> filtresActifs,
        SyntheseGlobaleVue synthese,
        List<ChantierBiVue> chantiers,
        List<RepartitionBean> repartitionChantiersCompacts
) {
}

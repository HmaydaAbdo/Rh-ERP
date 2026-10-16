package staport.rh.paie.report;

import java.util.List;

/**
 * Synthèse exécutive globale (chapitre I du rapport, « I — Vue d'ensemble ») — périmètre déterminé
 * par les filtres actifs (voir {@code PaieReportPdfRequestDto}), jamais silencieusement ignoré. Porte
 * les KPI, la couverture historique, la courbe d'évolution de masse mensuelle puis la répartition
 * par chantier (un seul graphique SVG à barres groupées masse/effectif/STC,
 * {@code repartitionChantier}) après la page dédiée aux évolutions d'effectif et de STC.
 * {@code repartitionFonction} reste
 * calculé mais n'est plus affiché (chapitre retiré temporairement, référentiel Fonction avec
 * doublons — voir {@code docs/report/README.md}, « Points d'extension »). {@code evolutionMensuelle}
 * ne contient que les mois disponibles dans la fenêtre de 12 mois et respecte les marchés
 * sélectionnés dans le wizard.
 * {@code stc} : total des STC/sorties du mois, tous chantiers confondus — même indicateur qu'au
 * niveau chantier/équipe (voir {@code ObservationStc.estStcOuSortie}), présent à chaque niveau de la
 * hiérarchie du rapport.
 */
record SyntheseGlobaleVue(
        String perimetreMarches,
        KpiMontantVue masse,
        KpiEffectifVue effectif,
        int nombreChantiers,
        int stc,
        String stcMontant,
        List<RepartitionBean> repartitionChantier,
        List<RepartitionBean> repartitionFonction,
        List<RepartitionBean> evolutionMensuelle
) {
}

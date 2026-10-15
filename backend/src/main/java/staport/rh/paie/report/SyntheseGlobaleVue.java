package staport.rh.paie.report;

import java.util.List;

/**
 * Synthèse exécutive globale (chapitre I du rapport, « I — Vue d'ensemble ») — périmètre déterminé
 * par les filtres actifs (voir {@code PaieReportPdfRequestDto}), jamais silencieusement ignoré. Porte
 * les KPI + un narratif léger, puis « Vue par chantier » (un seul {@code <barChart>} à barres
 * groupées masse/effectif/STC, {@code repartitionChantier}, voir
 * {@code PaieReportGroupedChartCustomizer}) sur sa propre page. {@code repartitionFonction} reste
 * calculé mais n'est plus affiché (chapitre retiré temporairement, référentiel Fonction avec
 * doublons — voir {@code docs/report/README.md}, « Points d'extension »). {@code evolutionMensuelle}
 * reste calculé lui aussi mais n'alimente plus aucun graphique (l'évolution mensuelle a été retirée
 * de tout le rapport, demande explicite de direction — voir {@code evolution-rapport/rapport-v2.md}).
 * {@code stc} : total des STC/sorties du mois, tous chantiers confondus — même indicateur qu'au
 * niveau chantier/équipe (voir {@code ObservationStc.estStcOuSortie}), présent à chaque niveau de la
 * hiérarchie du rapport.
 */
record SyntheseGlobaleVue(
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

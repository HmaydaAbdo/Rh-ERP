package staport.rh.paie.report;

import java.util.List;

/**
 * Synthèse exécutive globale (chapitre I du rapport, « I — Vue d'ensemble ») — périmètre déterminé
 * par les filtres actifs (voir {@code PaieReportPdfRequestDto}), jamais silencieusement ignoré. Porte
 * les 5 KPI + un narratif léger + l'évolution mensuelle (masse, effectif et STC,
 * {@code evolutionMensuelle}, un seul {@code <lineChart>} à double axe Y, voir
 * {@code PaieReportEvolutionChartCustomizer}) ; la déclinaison Chantiers/Fonctions n'est plus ici
 * (voir {@code docs/report/README.md}) : elle occupe sa propre page 100% graphique (chapitre II,
 * {@code repartitionChantier} — un seul {@code <barChart>} à barres groupées masse/effectif/STC, voir
 * {@code PaieReportGroupedChartCustomizer} ; chapitre III, {@code repartitionFonction}), jamais
 * tronquée. {@code stc} : total des STC/sorties du mois, tous chantiers confondus — même indicateur
 * qu'au niveau chantier/équipe (voir {@code ObservationStc.estStcOuSortie}), présent à chaque niveau
 * de la hiérarchie du rapport — chaque chantier et chaque fonction réellement présents sont
 * représentés, sans regroupement "Autres".
 */
record SyntheseGlobaleVue(
        KpiMontantVue masse,
        KpiEffectifVue effectif,
        String masseMoyenneParEmploye,
        int nombreChantiers,
        int stc,
        List<RepartitionBean> repartitionChantier,
        List<RepartitionBean> repartitionFonction,
        List<RepartitionBean> evolutionMensuelle
) {
}

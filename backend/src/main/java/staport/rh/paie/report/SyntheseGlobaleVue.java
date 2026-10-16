package staport.rh.paie.report;

import java.util.List;

/**
 * Synthèse exécutive globale (chapitre I du rapport, « I — Vue d'ensemble ») — périmètre déterminé
 * par les filtres actifs (voir {@code PaieReportPdfRequestDto}), jamais silencieusement ignoré. Porte
 * les KPI, l'évolution mensuelle masse/effectif et STC, puis la répartition par chantier
 * ({@code repartitionChantier}) dans trois rubriques numérotées. {@code evolutionMensuelle} ne
 * contient que les mois réellement disponibles dans la fenêtre de 12 mois et respecte les marchés
 * sélectionnés dans le wizard.
 * {@code stc}/{@code stcMontant} : nombre et montant des STC/sorties du mois, tous chantiers
 * confondus — les mêmes indicateurs qu'au niveau chantier/équipe (voir
 * {@code ObservationStc.estStcOuSortie}). Chaque KPI conserve sa valeur du mois précédent et sa
 * variation lorsque la comparaison est disponible.
 */
record SyntheseGlobaleVue(
        KpiMontantVue masse,
        KpiCompteVue effectif,
        KpiCompteVue nombreChantiers,
        KpiCompteVue stc,
        KpiMontantVue stcMontant,
        List<RepartitionBean> repartitionChantier,
        List<RepartitionBean> evolutionMensuelle
) {
}

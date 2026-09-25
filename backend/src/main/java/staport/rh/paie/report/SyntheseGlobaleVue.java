package staport.rh.paie.report;

import java.util.List;

/**
 * Synthèse exécutive globale (page "100% graphique" du rapport) — périmètre déterminé par les
 * filtres actifs (voir {@code PaieReportPdfRequestDto}), jamais silencieusement ignoré. Ne porte
 * plus aucun tableau statistique récapitulatif ni la déclinaison Chantiers/Fonctions : seul
 * l'indicateur Chantier est conservé (voir {@code docs/report/README.md}), le reste de la page est
 * intégralement graphique ({@code repartitionChantier}/{@code repartitionFonction} alimentent les 4
 * {@code <barChart>} JRXML — masse et effectif par chantier, masse et effectif par fonction).
 */
record SyntheseGlobaleVue(
        KpiMontantVue masse,
        KpiEffectifVue effectif,
        String masseMoyenneParEmploye,
        int nombreChantiers,
        List<RepartitionBean> repartitionChantier,
        List<RepartitionBean> repartitionFonction
) {
}

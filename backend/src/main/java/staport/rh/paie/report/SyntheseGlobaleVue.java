package staport.rh.paie.report;

import java.util.List;

/**
 * Synthèse exécutive globale (chapitre I du rapport) — périmètre déterminé par les filtres actifs
 * (voir {@code PaieReportPdfRequestDto}), jamais silencieusement ignoré. Porte les 4 KPI + un
 * narratif léger + l'évolution mensuelle (masse et effectif, {@code evolutionMensuelle}) ; la
 * déclinaison Chantiers/Fonctions n'est plus ici (voir {@code docs/report/README.md}) : elle occupe
 * ses 2 propres pages 100% graphiques (chapitres II et III, {@code repartitionChantier}/
 * {@code repartitionFonction}), jamais tronquées — chaque chantier et chaque fonction réellement
 * présents sont représentés, sans regroupement "Autres".
 */
record SyntheseGlobaleVue(
        KpiMontantVue masse,
        KpiEffectifVue effectif,
        String masseMoyenneParEmploye,
        int nombreChantiers,
        List<RepartitionBean> repartitionChantier,
        List<RepartitionBean> repartitionFonction,
        List<RepartitionBean> evolutionMensuelle
) {
}

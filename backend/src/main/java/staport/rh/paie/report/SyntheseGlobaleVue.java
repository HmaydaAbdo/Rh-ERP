package staport.rh.paie.report;

import java.util.List;

/**
 * Synthèse exécutive globale (chapitre I du rapport) — périmètre déterminé par les filtres actifs
 * (voir {@code PaieReportPdfRequestDto}), jamais silencieusement ignoré. Porte les 4 KPI + un
 * narratif léger + l'évolution mensuelle (masse et effectif, {@code evolutionMensuelle}) ; la
 * déclinaison Chantiers/Fonctions n'est plus ici (voir {@code docs/report/README.md}) : elle occupe
 * ses 2 propres pages 100% graphiques (chapitre II, {@code repartitionChantierEquipe} — colonnes
 * verticales empilées par équipe, voir {@code PaieBiReportBuilder.versRepartitionCroiseeParEquipe} ;
 * chapitre III, {@code repartitionFonction}), jamais tronquées. {@code stc} : total des STC/sorties du
 * mois, tous chantiers confondus — même indicateur qu'au niveau chantier/équipe (voir
 * {@code ObservationStc.estStcOuSortie}), présent à chaque niveau de la hiérarchie du rapport — chaque
 * chantier et chaque fonction réellement présents sont représentés, sans regroupement "Autres".
 */
record SyntheseGlobaleVue(
        KpiMontantVue masse,
        KpiEffectifVue effectif,
        String masseMoyenneParEmploye,
        int nombreChantiers,
        int stc,
        List<RepartitionCroiseeBean> repartitionChantierEquipe,
        List<RepartitionBean> repartitionFonction,
        List<RepartitionBean> evolutionMensuelle
) {
}

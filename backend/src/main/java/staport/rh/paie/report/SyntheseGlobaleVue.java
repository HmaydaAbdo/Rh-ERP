package staport.rh.paie.report;

import java.util.List;

/** Synthèse exécutive globale (page 1 du rapport) — périmètre déterminé par les filtres actifs
 * (voir {@code PaieReportPdfRequestDto}), jamais silencieusement ignoré. */
record SyntheseGlobaleVue(
        KpiMontantVue masse,
        KpiEffectifVue effectif,
        String masseMoyenneParEmploye,
        int nombreChantiers,
        int nombreFonctions,
        List<DistributionVue> distributionChantier,
        List<DistributionVue> distributionEquipe,
        List<EffectifFonctionSimpleVue> effectifParFonction,
        String graphiqueMasseParChantierBase64,
        String graphiqueMasseParEquipeBase64
) {
}

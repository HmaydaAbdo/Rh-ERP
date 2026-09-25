package staport.rh.paie.report;

/** Totaux affichés au bas de chaque section (chantier ou équipe) — valeurs déjà formatées. */
public record TotauxVue(
        int effectif,
        String sommeJours,
        String sommeSalaires,
        String totalGeneral
) {
}
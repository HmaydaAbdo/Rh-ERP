package staport.rh.paie.report;

public record TotauxVue(
        int effectif,
        String sommeJours,
        String sommeSalaires,
        String totalGeneral,
        String totalMoisPrecedent,
        String variation
) {
}
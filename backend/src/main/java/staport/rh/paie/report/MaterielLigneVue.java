package staport.rh.paie.report;

/**
 * Une ligne du squelette "parc matériel" (CAMION ou ENGINS) imprimé sur la section équipe du
 * chantier "C168" (équipes "CH"/"OP" — voir {@code PaieBiReportBuilder.squeletteMateriel}), même
 * décision et mêmes libellés que côté Excel ({@code staport.rh.paie.export.SqueletteMateriel}), mais
 * sans valeur : la colonne "Nbre" reste vide, remplie au stylo sur le document imprimé (demande
 * explicite de direction, 2026-09-28 — un rapport BI est un document figé, pas un fichier qu'on
 * réédite). Classe à getter, pas un record : {@code JRBeanCollectionDataSource} résout les champs
 * d'un sous-rapport par introspection JavaBean.
 */
public final class MaterielLigneVue {

    private final String libelle;

    MaterielLigneVue(String libelle) {
        this.libelle = libelle;
    }

    public String getLibelle() {
        return libelle;
    }
}

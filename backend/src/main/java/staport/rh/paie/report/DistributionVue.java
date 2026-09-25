package staport.rh.paie.report;

/**
 * Une ligne de distribution de la masse de paie par équipe, intra-chantier — {@code pourcentage}
 * est relatif à la masse du chantier englobant (jamais mélangé avec une part globale, voir
 * {@code PaieBiReportBuilder}). {@code libelle} vaut "Sans équipe" pour les bulletins sans équipe
 * renseignée — jamais exclu (voir {@code docs/report/README.md}). Classe simple à getters, pas un
 * record : consommée comme ligne de table par un subreport JRXML ({@code JRBeanCollectionDataSource},
 * introspection JavaBean).
 */
public final class DistributionVue {

    private final String libelle;
    private final int effectif;
    private final String montant;
    private final String pourcentage;

    DistributionVue(String libelle, int effectif, String montant, String pourcentage) {
        this.libelle = libelle;
        this.effectif = effectif;
        this.montant = montant;
        this.pourcentage = pourcentage;
    }

    public String getLibelle() {
        return libelle;
    }

    public int getEffectif() {
        return effectif;
    }

    public String getMontant() {
        return montant;
    }

    public String getPourcentage() {
        return pourcentage;
    }
}

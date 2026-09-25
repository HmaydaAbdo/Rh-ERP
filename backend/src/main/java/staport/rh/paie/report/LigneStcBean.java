package staport.rh.paie.report;

/**
 * Une ligne de la liste condensée "STC / Sorties du mois" (voir {@link staport.rh.paie.reporting.ObservationStc})
 * — classe simple à getters, pas un record, pour la même raison que {@link RepartitionBean}
 * (introspection JavaBean de {@code JRBeanCollectionDataSource}).
 */
public final class LigneStcBean {

    private final String nomPrenom;
    private final String chantier;
    private final String fonction;

    LigneStcBean(String nomPrenom, String chantier, String fonction) {
        this.nomPrenom = nomPrenom;
        this.chantier = chantier;
        this.fonction = fonction;
    }

    public String getNomPrenom() {
        return nomPrenom;
    }

    public String getChantier() {
        return chantier;
    }

    public String getFonction() {
        return fonction;
    }
}

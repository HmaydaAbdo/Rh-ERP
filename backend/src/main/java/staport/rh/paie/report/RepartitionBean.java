package staport.rh.paie.report;

import java.math.BigDecimal;

/**
 * Une catégorie (chantier ou fonction) d'une répartition de la synthèse globale — masse et
 * effectif bruts (jamais formatés), consommés comme source de données d'un {@code <barChart>}
 * JRXML natif. Classe simple à getters, pas un record : {@code JRBeanCollectionDataSource} résout
 * les champs d'un graphique par introspection JavaBean (convention {@code getXxx()}), pas par les
 * accesseurs générés pour un record.
 */
public final class RepartitionBean {

    private final String libelle;
    private final int effectif;
    private final BigDecimal montant;

    RepartitionBean(String libelle, int effectif, BigDecimal montant) {
        this.libelle = libelle;
        this.effectif = effectif;
        this.montant = montant;
    }

    public String getLibelle() {
        return libelle;
    }

    public int getEffectif() {
        return effectif;
    }

    public BigDecimal getMontant() {
        return montant;
    }
}

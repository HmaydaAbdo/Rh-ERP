package staport.rh.paie.report;

import java.math.BigDecimal;

/**
 * Une catégorie (chantier, équipe, fonction, ou point mensuel d'une évolution) d'une répartition du
 * rapport BI — masse, effectif et STC/sorties bruts (jamais formatés), consommés comme source de
 * données d'un {@code <barChart>}/{@code <lineChart>} JRXML natif (3 séries : masse en DH, effectif
 * et STC en personnes, voir {@code PaieReportEvolutionChartCustomizer}/
 * {@code PaieReportGroupedChartCustomizer}). Classe simple à getters, pas un record :
 * {@code JRBeanCollectionDataSource} résout les champs d'un graphique par introspection JavaBean
 * (convention {@code getXxx()}), pas par les accesseurs générés pour un record.
 */
public final class RepartitionBean {

    private final String libelle;
    private final int effectif;
    private final BigDecimal montant;
    private final int stc;

    RepartitionBean(String libelle, int effectif, BigDecimal montant, int stc) {
        this.libelle = libelle;
        this.effectif = effectif;
        this.montant = montant;
        this.stc = stc;
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

    public int getStc() {
        return stc;
    }
}

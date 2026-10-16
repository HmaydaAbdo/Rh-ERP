package staport.rh.paie.report;

import java.math.BigDecimal;

/**
 * Une catégorie (chantier, équipe, ou point mensuel d'une évolution) des graphiques BI — masse,
 * effectif et STC/sorties bruts (jamais formatés), consommés par les générateurs SVG. Le STC est porté
 * sous ses 2 représentations — {@code stc} (nombre de personnes) et {@code stcMontant} (masse
 * salariale des seules lignes STC/sortie) — demande explicite : les 2 doivent être visibles, pas une
 * seule (voir {@code docs/report/README.md}). Classe simple à getters conservée comme structure de
 * lecture compatible avec les agrégats de rapport existants.
 */
public final class RepartitionBean {

    private final String libelle;
    private final int effectif;
    private final BigDecimal montant;
    private final int stc;
    private final BigDecimal stcMontant;

    RepartitionBean(String libelle, int effectif, BigDecimal montant, int stc, BigDecimal stcMontant) {
        this.libelle = libelle;
        this.effectif = effectif;
        this.montant = montant;
        this.stc = stc;
        this.stcMontant = stcMontant;
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

    public BigDecimal getStcMontant() {
        return stcMontant;
    }
}

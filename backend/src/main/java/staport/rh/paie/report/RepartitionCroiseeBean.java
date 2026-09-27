package staport.rh.paie.report;

import java.math.BigDecimal;

/**
 * Une cellule (chantier, équipe) du croisement alimentant les {@code <stackedBarChart>} du chapitre
 * II — le chantier est la catégorie (colonne), l'équipe la série empilée dans cette colonne. Classe
 * simple à getters, pas un record : {@code JRBeanCollectionDataSource} résout les champs d'un
 * graphique par introspection JavaBean (convention {@code getXxx()}), pas par les accesseurs générés
 * pour un record — voir {@link RepartitionBean} pour la même contrainte sur les graphiques à une
 * seule série.
 */
public final class RepartitionCroiseeBean {

    private final String libelleChantier;
    private final String libelleEquipe;
    private final int effectif;
    private final BigDecimal montant;

    RepartitionCroiseeBean(String libelleChantier, String libelleEquipe, int effectif, BigDecimal montant) {
        this.libelleChantier = libelleChantier;
        this.libelleEquipe = libelleEquipe;
        this.effectif = effectif;
        this.montant = montant;
    }

    public String getLibelleChantier() {
        return libelleChantier;
    }

    public String getLibelleEquipe() {
        return libelleEquipe;
    }

    public int getEffectif() {
        return effectif;
    }

    public BigDecimal getMontant() {
        return montant;
    }
}

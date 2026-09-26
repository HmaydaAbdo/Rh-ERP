package staport.rh.paie.report;

import java.math.BigDecimal;

/**
 * Un point du graphique d'évolution de la masse salariale — une période (libellé court, ex. "août
 * 26") et sa masse réelle (brute, jamais formatée), consommé comme source de données d'un
 * {@code <lineChart>} JRXML natif. Classe simple à getters, pas un record : {@code
 * JRBeanCollectionDataSource} résout les champs d'un graphique par introspection JavaBean, pas par
 * les accesseurs générés pour un record. Couvre TOUTES les périodes réellement présentes en base
 * pour le périmètre filtré (pas une fenêtre glissante à trous) — voir
 * {@code PaieBiReportBuilder.evolutionMasse}.
 */
public final class EvolutionMasseBean {

    private final String libellePeriode;
    private final BigDecimal montant;

    EvolutionMasseBean(String libellePeriode, BigDecimal montant) {
        this.libellePeriode = libellePeriode;
        this.montant = montant;
    }

    public String getLibellePeriode() {
        return libellePeriode;
    }

    public BigDecimal getMontant() {
        return montant;
    }
}

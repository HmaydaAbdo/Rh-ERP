package staport.rh.paie.report;

import java.math.BigDecimal;

/**
 * Une paire (équipe, fonction) réellement présente sur un chantier et la masse salariale cumulée sur
 * cette paire — ligne à plat alimentant le stacked bar chart Équipe × Fonction d'un chantier (une
 * catégorie = une équipe, une série = une fonction) : JasperReports construit dynamiquement les
 * séries à partir des valeurs distinctes de {@code fonction} trouvées dans la liste, jamais une
 * série codée en dur par fonction (leur nombre varie d'un chantier à l'autre) — voir
 * {@code rapport.jrxml}. Classe à getters (pas un record) : liée par introspection JavaBean
 * ({@code JRBeanCollectionDataSource}), comme {@link RepartitionBean}/{@link DistributionVue}.
 */
public final class CroisementBean {

    private final String equipe;
    private final String fonction;
    private final BigDecimal montant;

    CroisementBean(String equipe, String fonction, BigDecimal montant) {
        this.equipe = equipe;
        this.fonction = fonction;
        this.montant = montant;
    }

    public String getEquipe() {
        return equipe;
    }

    public String getFonction() {
        return fonction;
    }

    public BigDecimal getMontant() {
        return montant;
    }
}

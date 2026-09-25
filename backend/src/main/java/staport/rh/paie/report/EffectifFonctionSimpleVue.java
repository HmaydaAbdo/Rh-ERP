package staport.rh.paie.report;

/** Effectif (+ STC) pour une fonction, intra-chantier. Classe simple à getters, pas un record —
 * même raison que {@link DistributionVue} (ligne de table d'un subreport JRXML). */
public final class EffectifFonctionSimpleVue {

    private final String fonction;
    private final int effectif;
    private final int stc;

    EffectifFonctionSimpleVue(String fonction, int effectif, int stc) {
        this.fonction = fonction;
        this.effectif = effectif;
        this.stc = stc;
    }

    public String getFonction() {
        return fonction;
    }

    public int getEffectif() {
        return effectif;
    }

    public int getStc() {
        return stc;
    }
}

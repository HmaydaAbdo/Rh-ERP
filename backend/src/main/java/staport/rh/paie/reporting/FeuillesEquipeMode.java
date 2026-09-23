package staport.rh.paie.reporting;

/** Partagé entre l'export Excel et le rapport PDF (staport.rh.paie.export / staport.rh.paie.report) —
 * détermine, pour chaque chantier, quelles équipes obtiennent une sous-feuille/sous-section dédiée. */
public enum FeuillesEquipeMode {
    AUCUNE,
    TOUTES,
    PERSONNALISE
}

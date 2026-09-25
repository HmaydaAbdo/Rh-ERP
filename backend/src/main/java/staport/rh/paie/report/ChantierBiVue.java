package staport.rh.paie.report;

import java.util.List;

/**
 * Synthèse BI d'un chantier — agrégations uniquement (jamais de tableau employé à ce niveau, voir
 * README « anti-redondance ») : masse et effectif de CE chantier, comparés au mois précédent sur le
 * même chantier, part de la masse globale de l'entreprise, distribution interne par équipe
 * (incluant "Sans équipe") et par fonction. Le détail employé est porté par {@link #equipes()}.
 */
record ChantierBiVue(
        String code,
        String titre,
        KpiMontantVue masse,
        KpiEffectifVue effectif,
        String partMasseGlobalePourcent,
        List<DistributionVue> distributionEquipe,
        List<EffectifFonctionSimpleVue> effectifParFonction,
        List<EquipeBiVue> equipes
) {
}

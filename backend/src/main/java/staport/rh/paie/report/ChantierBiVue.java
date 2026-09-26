package staport.rh.paie.report;

import java.util.List;

/**
 * Synthèse BI d'un chantier — agrégations uniquement (jamais de tableau employé à ce niveau, voir
 * README « anti-redondance ») : masse et effectif de CE chantier, comparés au mois précédent sur le
 * même chantier, coût moyen par employé, part de la masse globale de l'entreprise, distribution
 * interne par équipe et par fonction (incluant "Sans équipe"), croisement équipe × fonction (voir
 * {@link CroisementBean}), nombre de départs STC / sortie. Le détail employé est porté par
 * {@link #equipes()}.
 */
record ChantierBiVue(
        String code,
        String titre,
        KpiMontantVue masse,
        KpiEffectifVue effectif,
        String masseMoyenneParEmploye,
        String partMasseGlobalePourcent,
        int stc,
        List<DistributionVue> distributionEquipe,
        List<DistributionVue> distributionFonction,
        List<CroisementBean> croisementEquipeFonction,
        List<EquipeBiVue> equipes
) {
}

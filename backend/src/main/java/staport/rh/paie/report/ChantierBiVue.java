package staport.rh.paie.report;

import java.util.List;

/**
 * Synthèse BI d'un chantier — agrégations uniquement (jamais de tableau employé à ce niveau, voir
 * README « anti-redondance ») : masse et effectif de CE chantier, comparés au mois précédent sur le
 * même chantier, coût moyen par employé, part de la masse globale de l'entreprise, distribution
 * interne par équipe (incluant "Sans équipe" — {@code distributionEquipe} pour la table,
 * {@code repartitionEquipe} pour le graphique, mêmes agrégats sous les deux formes, voir
 * {@code PaieBiReportBuilder}) — la répartition par fonction à CE niveau a été retirée (demande
 * explicite de direction, doublon avec celle, plus fine, portée par chaque {@link EquipeBiVue}),
 * nombre de départs STC / sortie, évolution mensuelle (masse et effectif de CE chantier, 12 derniers
 * mois — voir {@code PaieBiReportBuilder.evolutionParNiveau}). Le détail employé est porté par
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
        List<RepartitionBean> repartitionEquipe,
        List<RepartitionBean> evolutionMensuelle,
        List<EquipeBiVue> equipes
) {
}

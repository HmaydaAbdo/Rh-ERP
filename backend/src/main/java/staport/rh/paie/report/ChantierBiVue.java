package staport.rh.paie.report;

import java.util.List;

/**
 * Synthèse BI d'un chantier — agrégations uniquement (jamais de tableau employé à ce niveau, voir
 * README « anti-redondance ») : masse et effectif de CE chantier, comparés au mois précédent sur le
 * même chantier, coût moyen par employé, part de la masse globale de l'entreprise, répartition
 * interne par équipe (incluant "Sans équipe" — {@code repartitionEquipe}, voir
 * {@code PaieBiReportBuilder}) — la répartition par fonction à CE niveau a été retirée (demande
 * explicite de direction, doublon avec celle, plus fine, portée par chaque {@link EquipeBiVue}),
 * nombre de départs STC / sortie, évolution mensuelle (masse et effectif de CE chantier, 12 derniers
 * mois — voir {@code PaieBiReportBuilder.evolutionParNiveau}). Le détail employé est porté par
 * {@link #equipes()}.
 *
 * <p>{@code compact} : {@code true} quand l'effectif de CE chantier est ≤
 * {@code PaieBiReportBuilder.SEUIL_CHANTIER_COMPACT} (demande explicite de direction : un chantier à 1
 * ou 2 personnes ne justifie pas son propre chapitre, sa propre page « Vue d'ensemble » + graphique
 * d'évolution, ni sa propre page « Équipes de chantier » — voir {@code PaieReportPdfService} pour la
 * consolidation de tous les chantiers compacts dans une unique section finale « Chantiers à effectif
 * réduit »). {@code masseFormatee} : masse de CE chantier, montant brut sans comparaison au mois
 * précédent (contrairement à {@code masse}) — sert d'en-tête compact quand ce chantier est affiché
 * sans sa propre page, réutilisant la mise en page du bloc « équipe » existant.
 */
record ChantierBiVue(
        String code,
        String titre,
        KpiMontantVue masse,
        KpiEffectifVue effectif,
        String masseMoyenneParEmploye,
        String partMasseGlobalePourcent,
        int stc,
        List<RepartitionBean> repartitionEquipe,
        List<RepartitionBean> evolutionMensuelle,
        List<EquipeBiVue> equipes,
        boolean compact,
        String masseFormatee
) {
}

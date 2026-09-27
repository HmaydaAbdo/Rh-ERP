package staport.rh.paie.report;

import java.util.List;

/** Section "équipe" (ou "Sans équipe") d'un chantier — le seul niveau qui descend jusqu'au détail
 * employé (voir stratégie anti-redondance dans le README : jamais de tableau employé au niveau
 * chantier). {@code stc} : STC/sorties de CETTE équipe (même indicateur qu'aux niveaux global et
 * chantier, présent à chaque niveau de la hiérarchie). {@code distributionFonction}/
 * {@code repartitionFonction} : répartition des employés de CETTE équipe par fonction (table et
 * graphique, même principe que la distribution par fonction au niveau chantier, voir
 * {@code ChantierBiVue}) — même pattern KPI → graphes → tableaux reproduit à chaque niveau.
 * {@code evolutionMensuelle} : masse, effectif et STC de CETTE équipe (au sein de ce chantier), 12
 * derniers mois — voir {@code PaieBiReportBuilder.evolutionParNiveau}. */
record EquipeBiVue(
        String nom,
        String titre,
        int effectif,
        String masse,
        String partChantierPourcent,
        int stc,
        List<DistributionVue> distributionFonction,
        List<RepartitionBean> repartitionFonction,
        List<RepartitionBean> evolutionMensuelle,
        List<LigneEmployeVue> employes
) {
}

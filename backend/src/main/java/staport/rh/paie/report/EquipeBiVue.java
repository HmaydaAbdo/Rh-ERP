package staport.rh.paie.report;

import java.util.List;

/** Section "équipe" (ou "Sans équipe") d'un chantier — le seul niveau qui descend jusqu'au détail
 * employé (voir stratégie anti-redondance dans le README : jamais de tableau employé au niveau
 * chantier). {@code stc} : STC/sorties de CETTE équipe (même indicateur qu'aux niveaux global et
 * chantier, présent à chaque niveau de la hiérarchie). {@code evolutionMensuelle} : masse et
 * effectif de CETTE équipe (au sein de ce chantier), 12 derniers mois — voir
 * {@code PaieBiReportBuilder.evolutionParNiveau}. */
record EquipeBiVue(
        String nom,
        String titre,
        int effectif,
        String masse,
        String partChantierPourcent,
        int stc,
        List<RepartitionBean> evolutionMensuelle,
        List<LigneEmployeVue> employes
) {
}

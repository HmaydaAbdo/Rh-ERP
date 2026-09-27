package staport.rh.paie.report;

import java.util.List;

/** Section "équipe" (ou "Sans équipe") d'un chantier — le seul niveau qui descend jusqu'au détail
 * employé (voir stratégie anti-redondance dans le README : jamais de tableau employé au niveau
 * chantier). {@code stc} : STC/sorties de CETTE équipe (même indicateur qu'aux niveaux global et
 * chantier, présent à chaque niveau de la hiérarchie). Aucune BI à ce niveau (ni graphique
 * d'évolution, ni répartition par fonction — demande explicite de direction, jugé redondant avec le
 * niveau chantier) : {@code employes} EST directement le contenu de la section, trié par fonction
 * (la fonction qui consomme le plus de masse salariale de cette équipe en premier — voir
 * {@code PaieBiReportBuilder.equipeVue}). */
record EquipeBiVue(
        String nom,
        String titre,
        int effectif,
        String masse,
        String partChantierPourcent,
        int stc,
        List<LigneEmployeVue> employes
) {
}

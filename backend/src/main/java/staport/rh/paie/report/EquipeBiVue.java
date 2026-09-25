package staport.rh.paie.report;

import java.util.List;

/** Section "équipe" (ou "Sans équipe") d'un chantier — le seul niveau qui descend jusqu'au détail
 * employé (voir stratégie anti-redondance dans le README : jamais de tableau employé au niveau
 * chantier). */
record EquipeBiVue(
        String nom,
        String titre,
        int effectif,
        String masse,
        String partChantierPourcent,
        List<LigneEmployeVue> employes
) {
}

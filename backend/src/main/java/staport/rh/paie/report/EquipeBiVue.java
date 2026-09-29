package staport.rh.paie.report;

import java.util.List;

/** Section employé d'un chantier — soit une vraie équipe explicitement sélectionnée par
 * l'utilisateur pour être détaillée séparément, soit le "reste" du chantier (les employés des
 * équipes NON sélectionnées, "Sans équipe" compris) : {@code nom} porte alors le code du chantier
 * (pas une vraie équipe) et {@code titre} le titre du chantier ("CHANTIER : xxx"), jamais "Sans
 * équipe" (demande explicite de direction, 2026-09-28 : ce nom prêterait à confusion pour un
 * regroupement qui peut très bien contenir des employés d'une vraie équipe non sélectionnée). Voir
 * {@code PaieBiReportBuilder.chantierVue} pour la construction de cette liste — un employé n'apparaît
 * JAMAIS dans deux sections différentes (contrairement à l'export Excel, où Global/chantier/équipe se
 * chevauchent volontairement, voir {@code docs/report/rapport-v2.md}).
 *
 * <p>{@code stc} : STC/sorties de CETTE section (même indicateur qu'aux niveaux global et chantier).
 * {@code montantMoisPrecedentOuIntrouvable} : masse de CETTE section le mois précédent (même
 * périmètre équipe/reste), "INTROUVABLE" si aucune donnée — alimente la ligne "TOTAL GENERAL MOIS
 * PRECEDENT" collée au bas du tableau employé (voir rapport.jrxml, GroupEquipe). {@code
 * repartitionFonction} : effectif et STC de CETTE section par fonction — nouveau tableau récap
 * (demande explicite de direction, 2026-09-28), imprimé via un sous-rapport (nombre de fonctions
 * variable, voir recap-fonction.jrxml), jamais un graphique (redondant avec celui du chantier).
 * {@code materiel} : squelette "parc matériel" (CAMION/ENGINS), vide sauf chantier "C168" équipes
 * "CH"/"OP" (voir {@code PaieBiReportBuilder.squeletteMateriel}) — imprimé via le même mécanisme de
 * sous-rapport que {@code repartitionFonction} (recap-materiel.jrxml).
 *
 * <p>{@code libelleAffiche} : nom complet de l'équipe pour AFFICHAGE uniquement (voir
 * {@code EquipeLibelleCatalogue}, "CHAUFFEURS" pour {@code nom == "CH"}) — {@code nom} reste le code
 * brut, réservé aux mécanismes internes (sélection utilisateur, ancre de page, comparaison avec
 * {@code chantierCode} pour détecter la section "reste") ; ne jamais afficher {@code nom} directement
 * dans le rapport (même principe que {@code chantierCode} vs {@code identifiantChantier}). Sans
 * signification pour une section "reste" (où {@code nom} vaut le code chantier, jamais affiché via ce
 * champ de toute façon). */
record EquipeBiVue(
        String nom,
        String titre,
        String libelleAffiche,
        int effectif,
        String masse,
        String partChantierPourcent,
        int stc,
        String montantMoisPrecedentOuIntrouvable,
        List<RepartitionBean> repartitionFonction,
        List<MaterielLigneVue> materiel,
        List<LigneEmployeVue> employes
) {
}

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
 * chevauchent volontairement, voir {@code evolution-rapport/rapport-v2.md}).
 *
 * <p>{@code effectif}, {@code masse}, {@code stc} et {@code stcMontant} : les indicateurs de CETTE
 * section, les mêmes qu'aux niveaux global et chantier. Ils portent leur valeur du mois précédent et
 * leur variation lorsque la comparaison sur ce même périmètre est disponible, voir
 * {@link KpiMontantVue} et {@link KpiCompteVue}. {@code
 * repartitionFonction} : agrégat par fonction, utilisé dans le graphique de rubrique 3 des équipes
 * sélectionnées et le récap des sections fusionnées.
 * {@code evolutionMensuelle} : historique mensuel de cette équipe, dérivé du même agrégat en base
 * que les niveaux global et chantier.
 * {@code materiel} : lignes du parc matériel éventuel (CAMION/ENGINS) avec les nombres saisis dans
 * le wizard d'export ; une ligne non renseignée garde une valeur {@code null}.
 *
 * <p>{@code libelleAffiche} : libellé de l'équipe ({@code Equipe.libelle}, "CHAUFFEURS" pour
 * {@code nom == "CH"}) pour AFFICHAGE uniquement — {@code nom} reste le code, réservé aux mécanismes internes (sélection utilisateur, ancre de page, comparaison avec
 * {@code chantierCode} pour détecter la section "reste") ; ne jamais afficher {@code nom} directement
 * dans le rapport (même principe que {@code chantierCode} vs {@code identifiantChantier}). Sans
 * signification pour une section "reste" (où {@code nom} vaut le code chantier, jamais affiché via ce
 * champ de toute façon). */
record EquipeBiVue(
        String nom,
        String titre,
        String libelleAffiche,
        KpiCompteVue effectif,
        KpiMontantVue masse,
        KpiCompteVue stc,
        KpiMontantVue stcMontant,
        List<RepartitionBean> repartitionFonction,
        List<RepartitionBean> evolutionMensuelle,
        List<MaterielLigneVue> materiel,
        List<LigneEmployeVue> employes,
        boolean equipeSelectionnee
) {
}

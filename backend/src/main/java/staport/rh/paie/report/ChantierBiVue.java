package staport.rh.paie.report;

import java.util.List;

/**
 * Synthèse BI d'un chantier — agrégations uniquement (jamais de tableau employé à ce niveau, voir
 * README « anti-redondance ») : masse et effectif de CE chantier, comparés au mois précédent sur le
 * même chantier, coût moyen par employé, répartition interne par équipe (incluant "Sans équipe" —
 * {@code repartitionEquipe}, voir
 * {@code PaieBiReportBuilder}) — la répartition par fonction à CE niveau a été retirée (demande
 * explicite de direction, doublon avec celle, plus fine, portée par chaque {@link EquipeBiVue}),
 * nombre de départs STC / sortie, {@code evolutionMensuelle} (masse et effectif de CE chantier, 12
 * derniers mois — voir {@code PaieBiReportBuilder.evolutionParNiveau}) : reste calculé mais n'alimente
 * plus aucun graphique du rapport (évolution mensuelle retirée de tout le document, demande explicite
 * de direction — voir {@code docs/report/rapport-v2.md}). Le détail employé est porté par
 * {@link #equipes()}.
 *
 * <p>{@code identifiant} : "&lt;nom&gt; (&lt;code&gt;)" quand {@code Chantier.nom} est renseigné,
 * "&lt;code&gt;" seul sinon (demande explicite de direction, 2026-09-29 : le nom prime partout où il
 * existe) — voir {@code PaieBiReportBuilder.identifiantChantier} (même règle, calculée
 * indépendamment côté Excel par {@code PaieExportService.titreZone}, jamais partagée en code :
 * chaque format construit son propre titre, voir docs/report/README.md « Pourquoi deux pipelines »).
 *
 * <p>Chaque chantier a désormais sa propre section (demande explicite de direction, 2026-09-29 :
 * fusion des exports PDF/Excel autour d'une seule sélection manuelle d'équipes — voir
 * {@code docs/report/rapport-v2.md}). {@code avecDetailEquipe} : {@code true} quand l'utilisateur a
 * sélectionné au moins une équipe de CE chantier pour un détail séparé (via
 * {@code PaieReportPdfRequestDto.equipesParChantier}, même sélection que l'export Excel) — pilote
 * l'affichage du graphique "répartition par équipe" (toujours la distribution COMPLÈTE, même si seule
 * une partie des équipes a sa propre section, voir {@code PaieBiReportBuilder.chantierVue}) et le
 * découpage de {@link #equipes()} en sections séparées. {@code false} : aucun graphique, {@code
 * equipes()} contient alors une seule section fusionnant tous les employés du chantier. Dans tous les
 * cas, un employé n'apparaît que dans UNE SEULE section (jamais de répétition, contrairement à
 * l'Excel).
 */
record ChantierBiVue(
        String code,
        String identifiant,
        String titre,
        KpiMontantVue masse,
        KpiEffectifVue effectif,
        String masseMoyenneParEmploye,
        int stc,
        List<RepartitionBean> repartitionEquipe,
        List<RepartitionBean> evolutionMensuelle,
        List<EquipeBiVue> equipes,
        boolean avecDetailEquipe
) {
}

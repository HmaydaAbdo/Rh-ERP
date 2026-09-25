package staport.rh.paie.report;

/**
 * Une ligne de distribution de la masse de paie sur une dimension (chantier ou équipe) —
 * {@code pourcentage} est relatif au total du périmètre englobant (masse globale pour une
 * distribution globale, masse du chantier pour une distribution intra-chantier — voir
 * {@code PaieBiReportBuilder}, jamais mélangé). {@code libelle} vaut "Sans équipe" pour les
 * bulletins sans équipe renseignée — jamais exclu (voir {@code docs/report/README.md}).
 */
record DistributionVue(
        String libelle,
        int effectif,
        String montant,
        String pourcentage
) {
}

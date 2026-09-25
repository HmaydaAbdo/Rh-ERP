package staport.rh.paie.report;

/** Une ligne employé dans le tableau détaillé d'une équipe (ou "Sans équipe") — mêmes colonnes que
 * la liste Paie à l'écran, moins chantier/équipe (déjà portés par les titres de section). */
record LigneEmployeVue(
        String nomPrenom,
        String fonction,
        String cin,
        int joursTravailles,
        String joursRecuperationOuvrable,
        String joursRecuperationDimanche,
        String salaireMensuel,
        String primeRoulageOrdinaire,
        String primeRoulageDimanche,
        String salaireTotal,
        String observation
) {
}

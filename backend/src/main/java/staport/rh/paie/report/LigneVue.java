package staport.rh.paie.report;

/** Vue-modèle d'une ligne employé pour le template Thymeleaf — reprend exactement la présentation
 * de l'export Excel / de l'UI (colonnes NOM&PRENOM, FONCTION, CIN, NBRE JRS[P/J.R.O/J.R.D],
 * SALAIRE[SALAIRE/RO/RD], TOTAL, OBS, CHANTIER, EQ). Valeurs déjà formatées. */
public record LigneVue(
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
        String observation,
        String chantier,
        String equipe
) {
}
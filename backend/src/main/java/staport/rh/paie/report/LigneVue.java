package staport.rh.paie.report;

/** Vue-modèle d'une ligne employé pour un template Thymeleaf — valeurs déjà formatées (aucune
 * logique de présentation dans les templates). */
public record LigneVue(
        String nomPrenom,
        String cin,
        String fonction,
        int joursTravailles,
        String salaireMensuel,
        String primeOrdinaire,
        String primeDimanche,
        String salaireTotal,
        String observation,
        String chantier,
        String equipe
) {
}

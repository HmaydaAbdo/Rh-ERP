package staport.rh.paie.imports;

import java.math.BigDecimal;

/**
 * Une ligne du fichier de paie, telle qu'elle est écrite (valeurs brutes, aucune référence résolue) : voir
 * {@link LecteurFichierPaie} pour l'ordre des colonnes.
 */
record LigneFichierPaie(
        int numeroLigne,
        String nomPrenom,
        String fonction,
        String cin,
        BigDecimal nombreJoursTravailles,
        BigDecimal joursRecuperationOuvrable,
        BigDecimal joursRecuperationDimanche,
        BigDecimal salaireMensuel,
        BigDecimal primeRoulageOrdinaire,
        BigDecimal primeRoulageDimanche,
        BigDecimal salaireTotal,
        String observation,
        String chantier,
        String equipe
) {
}

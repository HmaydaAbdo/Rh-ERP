package staport.rh.paie.export;

import java.util.List;

/**
 * Squelette de tableau matériel (CAMION ou ENGINS) à ajouter à côté du tableau "effectif par
 * fonction" d'une feuille équipe — labels uniquement, colonne "Nbre" laissée vide pour saisie
 * manuelle. Voir {@code PaieExportService#squeletteMateriel}.
 */
record SqueletteMateriel(String titreColonne, List<String> libelles) {
}

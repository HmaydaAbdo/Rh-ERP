package staport.rh.paie.export;

import java.util.List;
import java.util.Map;

/**
 * Tableau matériel (CAMION ou ENGINS) à ajouter à côté du tableau "effectif par
 * fonction" d'une feuille équipe — colonne "Nbre" remplie avec les nombres saisis dans l'assistant d'export
 * ({@code nombres}, libellé → nombre), laissée vide pour une ligne non renseignée. Voir {@code PaieExportService#squeletteMateriel}.
 */
record SqueletteMateriel(String titreColonne, List<String> libelles, Map<String, Integer> nombres) {
}

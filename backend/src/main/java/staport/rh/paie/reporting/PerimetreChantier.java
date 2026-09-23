package staport.rh.paie.reporting;

import staport.rh.paie.entities.Paie;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * Périmètre d'un chantier pour une période : lignes déjà filtrées des équipes exclues
 * ({@code equipesExcluesFeuilleChantier}), total du mois précédent calculé sur ce même périmètre
 * filtré (comparaison cohérente), les équipes à générer en sous-feuille/sous-section
 * ({@code lignesParEquipeAGenerer}, triées par équipe — {@link java.util.TreeMap}) et, pour
 * chacune, son propre total du mois précédent ({@code totalMoisPrecedentParEquipe} — absent de la
 * map ⇒ aucune donnée pour cette équipe le mois précédent, à afficher comme "INTROUVABLE").
 */
public record PerimetreChantier(
        String code,
        List<Paie> lignes,
        BigDecimal totalMoisPrecedent,
        Map<String, List<Paie>> lignesParEquipeAGenerer,
        Map<String, BigDecimal> totalMoisPrecedentParEquipe
) {
}

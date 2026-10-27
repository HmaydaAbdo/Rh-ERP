package staport.rh.heuresupp.imports;

import java.time.YearMonth;

/** Retour de l'étape initiale du wizard ; le mois est bloqué avant la sélection du fichier si aucune paie n'existe. */
public record HeuresSuppImportPrerequisDto(YearMonth periode, Long chantierId, int bulletinsDisponibles, boolean pret,
                                            String message) {
}

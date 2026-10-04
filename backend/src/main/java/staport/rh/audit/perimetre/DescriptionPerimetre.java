package staport.rh.audit.perimetre;

import java.util.Map;

/**
 * Ce qu'une classe {@link PerimetreAudit} apporte à l'entrée du journal.
 *
 * @param perimetre      description JSON-isable (mois, critères, nom et empreinte d'un fichier — jamais son contenu) ;
 *                       {@code null} si rien à dire
 * @param nombreElements nombre de lignes concernées, {@code null} si non pertinent
 * @param motifRejet     non {@code null} quand l'opération a <strong>rejeté sans lever d'exception</strong> (import dont
 *                       des lignes sont refusées) : l'entrée est alors un échec
 */
public record DescriptionPerimetre(Map<String, Object> perimetre, Integer nombreElements, String motifRejet) {

    public static final DescriptionPerimetre AUCUNE = new DescriptionPerimetre(null, null, null);

    public static DescriptionPerimetre de(Map<String, Object> perimetre, Integer nombreElements) {
        return new DescriptionPerimetre(perimetre, nombreElements, null);
    }

    public static DescriptionPerimetre rejet(Map<String, Object> perimetre, Integer nombreElements, String motif) {
        return new DescriptionPerimetre(perimetre, nombreElements, motif);
    }
}

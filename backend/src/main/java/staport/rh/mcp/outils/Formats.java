package staport.rh.mcp.outils;

/**
 * Formats et libellés partagés par les paramètres des outils MCP : un seul énoncé par notion, pour que le modèle lise
 * partout les mêmes consignes (vocabulaire du métier, format des mois, sens de l'identifiant 0).
 */
final class Formats {

    /** Mois au format aaaa-MM. */
    static final String PERIODE = "^[0-9]{4}-(0[1-9]|1[0-2])$";

    static final String PERIODE_DOC = "Mois de paie au format aaaa-MM, par exemple 2026-09. Absent = le dernier mois de paie "
            + "importé.";
    static final String CHANTIERS_DOC = "Identifiants des chantiers à inclure (entiers, rendus par `chantier_rechercher`). "
            + "Absent = tous les chantiers.";
    static final String EQUIPES_DOC = "Identifiants des équipes à inclure (rendus par `equipe_rechercher`) ; 0 désigne les "
            + "employés ou bulletins sans équipe. Absent = toutes les équipes.";
    static final String FONCTIONS_DOC = "Identifiants des fonctions (métiers) à inclure (rendus par `fonction_rechercher`). "
            + "Absent = toutes les fonctions.";
    static final String LIMITE_DOC = "Nombre d'éléments rendus, de 1 au maximum de l'outil.";
    static final String STATUT_EMPLOYE_DOC = "EN_POSTE (employés actuellement en poste) ou SORTI (employés partis). "
            + "Absent = tous.";

    private Formats() {
    }
}

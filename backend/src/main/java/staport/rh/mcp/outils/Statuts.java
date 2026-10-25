package staport.rh.mcp.outils;

import staport.rh.employee.entities.EmployeeStatut;

import java.util.List;
import java.util.Map;

/** Vocabulaire de l'interface pour un employé : « En poste » / « Sorti » (jamais actif/inactif), traduit vers l'API. */
final class Statuts {

    static final String EN_POSTE = "EN_POSTE";
    static final String SORTI = "SORTI";

    private Statuts() {
    }

    static Map<String, Object> schema() {
        return Map.of("type", "string", "enum", List.of(EN_POSTE, SORTI), "description", "Absent = tous les employés");
    }

    static EmployeeStatut lire(Arguments arguments) {
        return arguments.texte("statut").map(valeur -> switch (valeur) {
            case EN_POSTE -> EmployeeStatut.ACTIF;
            case SORTI -> EmployeeStatut.INACTIF;
            default -> throw OutilLecture.invalide("« statut » vaut EN_POSTE ou SORTI.");
        }).orElse(null);
    }

    static String libelle(EmployeeStatut statut) {
        return statut == EmployeeStatut.ACTIF ? EN_POSTE : SORTI;
    }

    /** Paramètre {@code statut} des vues Employés (valeurs de l'API, comme l'URL). */
    static void versUrl(EmployeeStatut statut, Map<String, String> parametres) {
        if (statut != null) {
            parametres.put("statut", statut.name());
        }
    }
}

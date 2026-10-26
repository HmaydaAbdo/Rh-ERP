package staport.rh.mcp.outils;

import staport.rh.employee.entities.EmployeeStatut;

import java.util.Map;

/** Vocabulaire de l'interface pour un employé : « En poste » / « Sorti » (jamais actif/inactif), traduit vers l'API. */
public enum StatutEmploye {

    EN_POSTE(EmployeeStatut.ACTIF),
    SORTI(EmployeeStatut.INACTIF);

    private final EmployeeStatut statut;

    StatutEmploye(EmployeeStatut statut) {
        this.statut = statut;
    }

    /** Le statut de l'API ; {@code null} quand l'argument est absent (tous les employés). */
    public static EmployeeStatut versApi(StatutEmploye valeur) {
        return valeur == null ? null : valeur.statut;
    }

    public static String libelle(EmployeeStatut statut) {
        return statut == EmployeeStatut.ACTIF ? EN_POSTE.name() : SORTI.name();
    }

    /** Paramètre {@code statut} des vues Employés (valeurs de l'API, comme l'URL). */
    public static void versUrl(EmployeeStatut statut, Map<String, String> parametres) {
        if (statut != null) {
            parametres.put("statut", statut.name());
        }
    }
}

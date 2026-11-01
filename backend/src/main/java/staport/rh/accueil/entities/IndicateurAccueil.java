package staport.rh.accueil.entities;

import java.util.Arrays;
import java.util.Optional;

/**
 * Catalogue fixe des indicateurs que l'écran d'accueil peut afficher. Chaque indicateur est protégé par la permission de lecture
 * du domaine qui porte sa donnée : l'accueil ne donne jamais accès à ce que l'utilisateur ne pourrait pas lire ailleurs. La valeur
 * de l'indicateur vient des API des domaines (analytique de paie, analytique des fiches Employé) ; ce domaine ne garde que le choix
 * et l'ordre des indicateurs affichés.
 */
public enum IndicateurAccueil {

    PAIE_MASSE("paie.masse", "Masse salariale", "Masse salariale du dernier mois de paie, avec sa variation sur le mois précédent", "PAIE_READ"),
    PAIE_EFFECTIF("paie.effectif", "Bulletins de paie", "Nombre de bulletins de paie (un par employé payé) du dernier mois de paie", "PAIE_READ"),
    PAIE_COUT_MOYEN("paie.cout-moyen", "Coût moyen par personne", "Masse salariale divisée par le nombre de bulletins du dernier mois", "PAIE_READ"),
    PAIE_STC("paie.stc", "Soldes de tout compte", "Nombre et montant des soldes de tout compte du dernier mois de paie", "PAIE_READ"),
    EMPLOYE_EFFECTIF("employe.effectif", "Employés", "Effectif des fiches Employé", "EMPLOYEE_READ"),
    EMPLOYE_EN_POSTE("employe.en-poste", "Employés en poste", "Part des fiches Employé en poste", "EMPLOYEE_READ"),
    EMPLOYE_AGE_MOYEN("employe.age-moyen", "Âge moyen", "Âge moyen des employés en poste", "EMPLOYEE_READ"),
    EMPLOYE_ANCIENNETE_MOYENNE("employe.anciennete-moyenne", "Ancienneté moyenne", "Ancienneté moyenne des employés en poste", "EMPLOYEE_READ"),
    EMPLOYE_EMBAUCHES("employe.embauches", "Embauches sur 12 mois", "Employés embauchés au cours des douze derniers mois", "EMPLOYEE_READ");

    private final String code;
    private final String libelle;
    private final String description;
    private final String permission;

    IndicateurAccueil(String code, String libelle, String description, String permission) {
        this.code = code;
        this.libelle = libelle;
        this.description = description;
        this.permission = permission;
    }

    public String code() {
        return code;
    }

    public String libelle() {
        return libelle;
    }

    public String description() {
        return description;
    }

    /** Permission de lecture exigée pour voir cet indicateur. */
    public String permission() {
        return permission;
    }

    public static Optional<IndicateurAccueil> depuisCode(String code) {
        return Arrays.stream(values()).filter(indicateur -> indicateur.code.equals(code)).findFirst();
    }
}

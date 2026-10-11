package staport.rh.parametre.entities;

import org.springframework.scheduling.support.CronExpression;
import staport.rh.parametre.exceptions.ParametreInvalideException;

import java.util.Arrays;
import java.util.Optional;

/**
 * Le catalogue des paramètres administrables : pour chaque clé, ce qu'elle règle, son type et ses bornes. Les VALEURS ne
 * sont pas ici (conventions/configuration.md : une valeur métier n'est jamais codée) : elles vivent dans la table
 * {@code parametre}, posées par la migration puis modifiées depuis l'écran Paramètres. Ajouter un paramètre : une valeur
 * de cet enum, une migration qui insère sa ligne de départ, et son lecteur typé dans {@code IParametreService}.
 */
public enum CleParametre {

    JETON_ACCES("securite.jeton-acces.minutes", "Durée de l'Access Token",
            "Au-delà, l'interface renouvelle le jeton avec le jeton de session. Une durée courte limite l'effet d'un jeton volé ; "
                    + "un changement de permissions s'applique au prochain renouvellement.",
            TypeParametre.ENTIER, "minutes", 1L, 1440L),
    JETON_SESSION("securite.jeton-session.heures", "Durée de la session",
            "Durée de vie du jeton de session (cookie) : passé ce délai sans reconnexion, l'utilisateur doit se reconnecter. "
                    + "Ne s'applique qu'aux sessions ouvertes après le changement.",
            TypeParametre.ENTIER, "heures", 1L, 720L),
    LIEN_REINITIALISATION("securite.lien-reinitialisation.minutes", "Validité du lien de réinitialisation",
            "Durée pendant laquelle le lien reçu par courriel permet de choisir un nouveau mot de passe (usage unique).",
            TypeParametre.ENTIER, "minutes", 5L, 1440L),
    LONGUEUR_MOT_DE_PASSE("securite.mot-de-passe.longueur-minimale", "Longueur minimale du mot de passe",
            "S'applique à la création d'un compte et aux réinitialisations ; les mots de passe existants ne changent pas. "
                    + "Une lettre et un chiffre au moins restent exigés.",
            TypeParametre.ENTIER, "caractères", 8L, 100L),
    PAS_TRANCHE_ANALYTIQUE("paie.analytique.pas-tranche", "Pas des tranches de l'analytique de paie",
            "Largeur minimale et pas d'arrondi des tranches de la répartition des salaires : des bornes lisibles "
                    + "(500, 1 000, 1 500...).",
            TypeParametre.ENTIER, "DH", 1L, 100000L),
    CRON_SYNCHRONISATION_CHANTIERS("chantier.synchronisation.cron", "Planification de la synchronisation des chantiers",
            "Expression cron à six champs (secondes, minutes, heures, jour, mois, jour de semaine) ; « 0 0 23 * * * » = chaque "
                    + "jour à 23 h. Le changement s'applique après la prochaine exécution.",
            TypeParametre.CRON, null, null, null);

    private final String code;
    private final String libelle;
    private final String description;
    private final TypeParametre type;
    private final String unite;
    private final Long minimum;
    private final Long maximum;

    CleParametre(String code, String libelle, String description, TypeParametre type, String unite, Long minimum, Long maximum) {
        this.code = code;
        this.libelle = libelle;
        this.description = description;
        this.type = type;
        this.unite = unite;
        this.minimum = minimum;
        this.maximum = maximum;
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

    public TypeParametre type() {
        return type;
    }

    /** Unité d'affichage ({@code null} pour une expression cron). */
    public String unite() {
        return unite;
    }

    public Long minimum() {
        return minimum;
    }

    public Long maximum() {
        return maximum;
    }

    public static Optional<CleParametre> depuisCode(String code) {
        return Arrays.stream(values()).filter(cle -> cle.code.equals(code)).findFirst();
    }

    /**
     * Valide la saisie selon le type et les bornes de la clé et renvoie la valeur à stocker (espaces retirés, forme
     * canonique d'un entier).
     *
     * @throws ParametreInvalideException si la valeur n'est pas du bon type ou sort des bornes
     */
    public String normaliser(String saisie) {
        String valeur = saisie == null ? "" : saisie.trim();
        return switch (type) {
            case ENTIER -> normaliserEntier(valeur);
            case CRON -> normaliserCron(valeur);
        };
    }

    private String normaliserEntier(String valeur) {
        long nombre;
        try {
            nombre = Long.parseLong(valeur);
        } catch (NumberFormatException e) {
            throw new ParametreInvalideException(libelle + " : un nombre entier est attendu.");
        }
        if (nombre < minimum || nombre > maximum) {
            throw new ParametreInvalideException(libelle + " : la valeur doit être comprise entre " + minimum + " et " + maximum + ".");
        }
        return Long.toString(nombre);
    }

    private String normaliserCron(String valeur) {
        if (!CronExpression.isValidExpression(valeur)) {
            throw new ParametreInvalideException(libelle + " : expression cron invalide (six champs attendus, par exemple « 0 0 23 * * * »).");
        }
        return valeur;
    }
}

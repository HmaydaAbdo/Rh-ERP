package staport.rh.parametre.entities;

/** Nature de la valeur d'un paramètre : détermine sa validation et le champ de saisie de l'écran. */
public enum TypeParametre {
    /** Nombre entier, dans les bornes de la clé. */
    ENTIER,
    /** Expression cron de Spring à six champs (secondes comprises), par exemple {@code 0 0 23 * * *}. */
    CRON
}

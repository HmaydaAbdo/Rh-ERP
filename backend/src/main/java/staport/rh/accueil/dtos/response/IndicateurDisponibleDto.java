package staport.rh.accueil.dtos.response;

/** Un indicateur que l'utilisateur peut afficher : son code (clé du catalogue), son libellé et son explication. */
public record IndicateurDisponibleDto(String code, String libelle, String description) {
}

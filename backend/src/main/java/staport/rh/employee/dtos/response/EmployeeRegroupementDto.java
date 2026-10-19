package staport.rh.employee.dtos.response;

/**
 * Un groupe d'employés de la vue Cartes : un chantier, une équipe ou une fonction, avec son effectif. Pour l'équipe,
 * {@code id} vaut {@code 0} pour les employés sans équipe (même convention que le filtre {@code equipeIds}).
 */
public record EmployeeRegroupementDto(
        long id,
        String code,
        String libelle,
        long effectif,
        long actifs
) {
}

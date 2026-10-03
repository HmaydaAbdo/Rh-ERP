package staport.rh.paie.dtos.response;

/** Une équipe d'un chantier pour un mois donné, avec son effectif sur ce mois. */
public record PaieEquipePeriodeDto(
        Long id,
        String code,
        String libelle,
        long effectif
) {
}

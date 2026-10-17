package staport.rh.paie.dtos.response;

import java.math.BigDecimal;

/** Une équipe d'un chantier pour un mois donné, avec son effectif et sa masse salariale sur ce mois. */
public record PaieEquipePeriodeDto(
        Long id,
        String code,
        String libelle,
        long effectif,
        BigDecimal masse,
        long stc,
        BigDecimal stcMontant,
        PaiePeriodeComparaisonDto moisPrecedent
) {
}

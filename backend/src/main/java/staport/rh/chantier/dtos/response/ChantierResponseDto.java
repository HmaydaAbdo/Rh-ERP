package staport.rh.chantier.dtos.response;

import staport.rh.chantier.entities.NatureChantier;
import java.math.BigDecimal;

public record ChantierResponseDto(
        Long id,
        Long version,
        String code,
        String designation,
        String nom,
        boolean sourceErp,
        boolean actif,
        NatureChantier nature,
        String localisation,
        BigDecimal latitude,
        BigDecimal longitude,
        boolean afficherSurCarte
) {
}

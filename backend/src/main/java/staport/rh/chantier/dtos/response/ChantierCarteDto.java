package staport.rh.chantier.dtos.response;

import staport.rh.chantier.entities.NatureChantier;
import java.math.BigDecimal;

/** Projection publique de la carte, sans données de paie ni données de gestion. */
public record ChantierCarteDto(Long id, String code, String designation, String nom, NatureChantier nature,
                               String localisation, BigDecimal latitude, BigDecimal longitude) {}

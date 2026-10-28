package staport.rh.heuresupp.dtos.response;

import staport.rh.employee.entities.TypeSalaire;

import java.math.BigDecimal;
import java.time.YearMonth;

/** Champs, unités et formules explicités pour les écrans et les capacités MCP du domaine. */
public record HeureSuppResponseDto(
        Long id,
        Long version,
        Long employeeId,
        String nomPrenom,
        String cin,
        Long fonctionId,
        String fonction,
        Long chantierId,
        String codeChantier,
        String chantier,
        YearMonth periode,
        BigDecimal salaireReferenceDh,
        TypeSalaire typeSalaireReference,
        BigDecimal salaireHoraireDh,
        BigDecimal heuresSupplementaires,
        BigDecimal montantDh,
        boolean stcOuSortie,
        BigDecimal stcDh,
        BigDecimal forfaitDh,
        BigDecimal netAPayerDh
) {
}

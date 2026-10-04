package staport.rh.paie.dtos.response;

import java.math.BigDecimal;
import java.util.List;

/** Un chantier tel qu'il apparaît dans la paie d'un mois, avec ses équipes — alimente l'étape « détail par équipe »
 * de l'assistant d'export. {@code libelle} est le nom du chantier, à défaut sa désignation (peut être nul).
 * Les bulletins sans équipe ne figurent pas dans {@code equipes}, mais comptent dans {@code effectif}. */
public record PaieChantierPeriodeDto(
        Long id,
        String code,
        String libelle,
        long effectif,
        BigDecimal masse,
        List<PaieEquipePeriodeDto> equipes
) {
}

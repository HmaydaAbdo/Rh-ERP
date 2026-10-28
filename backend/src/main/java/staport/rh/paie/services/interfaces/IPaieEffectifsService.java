package staport.rh.paie.services.interfaces;

import staport.rh.paie.effectifs.EffectifMoisDto;
import staport.rh.paie.effectifs.EffectifsCriteria;

import java.util.List;
import java.time.YearMonth;

/** Mouvements et indicateurs d'effectif mensuels — façade publique de la Paie. */
public interface IPaieEffectifsService {

    List<EffectifMoisDto> tendances(EffectifsCriteria criteres);

    /** Tendances complètes, ou un mois précis si fourni (comparaison calculée avec son mois précédent). */
    List<EffectifMoisDto> tendances(EffectifsCriteria criteres, YearMonth periode);
}

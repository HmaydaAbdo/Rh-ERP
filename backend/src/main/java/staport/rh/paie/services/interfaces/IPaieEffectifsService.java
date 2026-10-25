package staport.rh.paie.services.interfaces;

import staport.rh.paie.effectifs.EffectifMoisDto;
import staport.rh.paie.effectifs.EffectifsCriteria;

import java.util.List;

/** Mouvements d'effectif mois par mois (employés payés, entrées, sorties, mutations) — façade publique de la Paie. */
public interface IPaieEffectifsService {

    List<EffectifMoisDto> tendances(EffectifsCriteria criteres);
}

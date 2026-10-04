package staport.rh.paie.services.interfaces;

import staport.rh.paie.dtos.request.PaieSearchCriteria;
import staport.rh.paie.dtos.response.PaieAnalytiqueDto;

/** Indicateurs du tableau de bord analytique de la paie (voir docs/paie/README.md, « Vue Analytique »). */
public interface IPaieAnalytiqueService {

    /** Indicateurs, répartitions, évolution et qualité des données du mois de {@code criteres} (obligatoire), sur son
     * périmètre filtré. */
    PaieAnalytiqueDto analyser(PaieSearchCriteria criteres);
}

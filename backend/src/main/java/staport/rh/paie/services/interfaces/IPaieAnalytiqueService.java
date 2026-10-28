package staport.rh.paie.services.interfaces;

import staport.rh.paie.dtos.request.PaieSearchCriteria;
import staport.rh.paie.dtos.response.PaieAnalytiqueDto;
import staport.rh.paie.dtos.response.PaieComparaisonDto;
import staport.rh.paie.dtos.response.PaieRepartitionDto;
import staport.rh.paie.dtos.response.PaieAnalytiqueDto.Evolution;

import java.util.List;

/** Indicateurs du tableau de bord analytique de la paie (voir docs/paie/README.md, « Vue Analytique »). */
public interface IPaieAnalytiqueService {

    /** Indicateurs, répartitions, évolution et qualité des données du mois de {@code criteres} (obligatoire), sur son
     * périmètre filtré. */
    PaieAnalytiqueDto analyser(PaieSearchCriteria criteres);

    /** Série historique du périmètre, limitée au mois demandé (inclus) ; sans plafond de périodes. */
    List<Evolution> evolutionJusqua(PaieSearchCriteria criteres);

    /** Comparaison déterministe de deux périodes ; une référence absente désigne le mois civil précédent. */
    PaieComparaisonDto comparer(PaieSearchCriteria recent, PaieSearchCriteria reference,
                                PaieComparaisonDto.Dimension dimension, PaieComparaisonDto.Tri tri, boolean ascendant);

    /** Répartition du mois, triée selon le critère métier demandé ; {@code ascendant} nul choisit le sens par défaut. */
    PaieRepartitionDto repartir(PaieSearchCriteria criteres, PaieRepartitionDto.Dimension dimension,
                                PaieRepartitionDto.Tri tri, Boolean ascendant);
}

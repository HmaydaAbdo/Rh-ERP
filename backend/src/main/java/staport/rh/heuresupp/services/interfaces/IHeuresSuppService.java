package staport.rh.heuresupp.services.interfaces;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import staport.rh.heuresupp.dtos.request.HeuresSuppSearchCriteria;
import staport.rh.heuresupp.dtos.response.HeureSuppResponseDto;
import staport.rh.heuresupp.dtos.request.HeuresSuppModificationDto;
import staport.rh.heuresupp.dtos.request.HeuresSuppCreationDto;
import java.time.YearMonth;

public interface IHeuresSuppService {
    HeureSuppResponseDto creer(HeuresSuppCreationDto requete);

    Page<HeureSuppResponseDto> rechercher(HeuresSuppSearchCriteria criteres, Pageable pageable);

    HeureSuppResponseDto rechercherParId(Long id);

    HeureSuppResponseDto modifier(Long id, HeuresSuppModificationDto requete);
    void supprimer(Long id);
    long supprimerMois(YearMonth periode, long nombreAttendu);
}

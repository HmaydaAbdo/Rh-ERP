package staport.rh.heuresupp.services.interfaces;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import staport.rh.heuresupp.dtos.request.HeuresSuppSearchCriteria;
import staport.rh.heuresupp.dtos.response.HeureSuppResponseDto;

public interface IHeuresSuppService {

    Page<HeureSuppResponseDto> rechercher(HeuresSuppSearchCriteria criteres, Pageable pageable);
}

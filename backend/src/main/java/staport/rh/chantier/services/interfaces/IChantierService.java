package staport.rh.chantier.services.interfaces;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import staport.rh.chantier.dtos.request.ChantierCreateRequestDto;
import staport.rh.chantier.dtos.request.ChantierSearchCriteria;
import staport.rh.chantier.dtos.request.ChantierUpdateRequestDto;
import staport.rh.chantier.dtos.response.ChantierResponseDto;
import staport.rh.chantier.dtos.request.ChantierStatutRequestDto;
import staport.rh.chantier.dtos.response.ChantierCarteDto;
import java.util.List;

/**
 * Façade publique du module Chantier — seule cette interface peut être injectée
 * par un autre domaine (conventions/architecture.md, section Encapsulation des domaines).
 */
public interface IChantierService {

    ChantierResponseDto create(ChantierCreateRequestDto dto);

    ChantierResponseDto update(Long id, ChantierUpdateRequestDto dto);

    ChantierResponseDto findById(Long id);

    ChantierResponseDto changerStatut(Long id, ChantierStatutRequestDto dto);

    List<ChantierCarteDto> carte();

    Page<ChantierResponseDto> search(ChantierSearchCriteria criteria, Pageable pageable);

    void delete(Long id);

    boolean existsById(Long id);
}

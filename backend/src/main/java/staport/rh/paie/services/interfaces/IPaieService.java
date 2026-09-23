package staport.rh.paie.services.interfaces;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import staport.rh.paie.dtos.request.PaieCreateRequestDto;
import staport.rh.paie.dtos.request.PaieSearchCriteria;
import staport.rh.paie.dtos.request.PaieUpdateRequestDto;
import staport.rh.paie.dtos.response.PaieResponseDto;

import java.time.YearMonth;
import java.util.List;

/**
 * Façade publique du module Paie — seule cette interface peut être injectée
 * par un autre domaine (conventions/architecture.md, section Encapsulation des domaines).
 */
public interface IPaieService {

    PaieResponseDto create(PaieCreateRequestDto dto);

    PaieResponseDto update(Long id, PaieUpdateRequestDto dto);

    PaieResponseDto findById(Long id);

    Page<PaieResponseDto> search(PaieSearchCriteria criteria, Pageable pageable);

    void delete(Long id);

    /** Équipes distinctes trouvées sur les bulletins d'un chantier pour une période — alimente la
     * configuration de l'export (aucun référentiel Équipe dédié, voir docs/paie/README.md). */
    List<String> findDistinctEquipes(String chantierCode, YearMonth periode);
}

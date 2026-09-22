package staport.rh.function.services.interfaces;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import staport.rh.function.dtos.request.FunctionCreateRequestDto;
import staport.rh.function.dtos.request.FunctionSearchCriteria;
import staport.rh.function.dtos.request.FunctionUpdateRequestDto;
import staport.rh.function.dtos.response.FunctionResponseDto;

/**
 * Façade publique du module Function — seule cette interface peut être injectée
 * par un autre domaine (conventions/architecture.md, section Encapsulation des domaines).
 */
public interface IFunctionService {

    FunctionResponseDto create(FunctionCreateRequestDto dto);

    FunctionResponseDto update(Long id, FunctionUpdateRequestDto dto);

    FunctionResponseDto findById(Long id);

    Page<FunctionResponseDto> search(FunctionSearchCriteria criteria, Pageable pageable);

    void delete(Long id);

    /**
     * Vérifie l'existence d'une fonction — utilisé par les domaines consommateurs (ex. Employee)
     * pour valider une référence sans dépendre du Repository de ce module.
     */
    boolean existsById(Long id);
}

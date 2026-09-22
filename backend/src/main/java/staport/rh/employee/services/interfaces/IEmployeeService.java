package staport.rh.employee.services.interfaces;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import staport.rh.employee.dtos.request.EmployeeCreateRequestDto;
import staport.rh.employee.dtos.request.EmployeeSearchCriteria;
import staport.rh.employee.dtos.request.EmployeeUpdateRequestDto;
import staport.rh.employee.dtos.response.EmployeeResponseDto;

/**
 * Façade publique du module Employee — seule cette interface peut être injectée
 * par un autre domaine (conventions/architecture.md, section Encapsulation des domaines).
 * Les futurs domaines Pointage et Paie consommeront Employee via cette interface.
 */
public interface IEmployeeService {

    EmployeeResponseDto create(EmployeeCreateRequestDto dto);

    EmployeeResponseDto update(Long id, EmployeeUpdateRequestDto dto);

    EmployeeResponseDto findById(Long id);

    Page<EmployeeResponseDto> search(EmployeeSearchCriteria criteria, Pageable pageable);

    void delete(Long id);

    boolean existsById(Long id);
}

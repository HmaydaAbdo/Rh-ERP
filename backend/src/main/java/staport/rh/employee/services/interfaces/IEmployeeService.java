package staport.rh.employee.services.interfaces;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import staport.rh.employee.dtos.request.EmployeeCreateRequestDto;
import staport.rh.employee.dtos.request.EmployeeSearchCriteria;
import staport.rh.employee.dtos.request.EmployeeUpdateRequestDto;
import staport.rh.employee.dtos.response.EmployeeResponseDto;
import staport.rh.employee.dtos.response.EmployeeSortieDto;
import staport.rh.employee.dtos.response.EmployeeSortiesMoisDto;

import java.time.YearMonth;
import java.util.List;
import java.util.Optional;

/**
 * Façade publique du module Employee — seule cette interface peut être injectée
 * par un autre domaine (conventions/architecture.md, section Encapsulation des domaines).
 * Les futurs domaines Pointage et Paie consommeront Employee via cette interface.
 */
public interface IEmployeeService {

    EmployeeResponseDto create(EmployeeCreateRequestDto dto);

    EmployeeResponseDto update(Long id, EmployeeUpdateRequestDto dto);

    EmployeeResponseDto findById(Long id);

    /** Résolution exacte du CIN pour les imports métier ; ne pas remplacer par une recherche partielle paginée. */
    Optional<EmployeeResponseDto> findByCin(String cin);

    Page<EmployeeResponseDto> search(EmployeeSearchCriteria criteria, Pageable pageable);

    void delete(Long id);

    boolean existsById(Long id);

    /**
     * Enregistre le départ de l'employé de l'entreprise, constaté par la paie du mois {@code periode} (STC du fichier, ou
     * absence confirmée) : il passe INACTIF et le départ rejoint son parcours. Un seul départ par mois.
     */
    void enregistrerSortie(Long id, YearMonth periode, String motif);

    /** Les départs de l'employé, du plus ancien au plus récent (son parcours, avec ses bulletins). */
    List<EmployeeSortieDto> listerSorties(Long id);

    /** Tous les départs enregistrés, du plus ancien au plus récent (tendances mois par mois de l'Analytique). */
    List<EmployeeSortieDto> listerToutesLesSorties();

    /** Départs confirmés d'un mois, agrégés par motif ; l'adaptateur borne la liste nominative rendue. */
    EmployeeSortiesMoisDto sortiesDuMois(YearMonth periode);
}

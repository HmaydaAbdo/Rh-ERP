package staport.rh.equipe.services.interfaces;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import staport.rh.equipe.dtos.request.EquipeCreateRequestDto;
import staport.rh.equipe.dtos.request.EquipeSearchCriteria;
import staport.rh.equipe.dtos.request.EquipeUpdateRequestDto;
import staport.rh.equipe.dtos.response.EquipeResponseDto;

/**
 * Façade publique du module Équipe — seule cette interface peut être injectée
 * par un autre domaine (conventions/architecture.md, section Encapsulation des domaines).
 */
public interface IEquipeService {

    EquipeResponseDto create(EquipeCreateRequestDto dto);

    EquipeResponseDto update(Long id, EquipeUpdateRequestDto dto);

    EquipeResponseDto findById(Long id);

    Page<EquipeResponseDto> search(EquipeSearchCriteria criteria, Pageable pageable);

    void delete(Long id);

    /**
     * Vérifie l'existence d'une équipe — utilisé par les domaines consommateurs (ex. Paie) pour
     * valider une référence sans dépendre du Repository de ce module.
     */
    boolean existsById(Long id);
}

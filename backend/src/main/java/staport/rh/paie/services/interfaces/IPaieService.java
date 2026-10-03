package staport.rh.paie.services.interfaces;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import staport.rh.paie.dtos.request.PaieCreateRequestDto;
import staport.rh.paie.dtos.request.PaieSearchCriteria;
import staport.rh.paie.dtos.request.PaieUpdateRequestDto;
import staport.rh.paie.dtos.response.PaieChantierPeriodeDto;
import staport.rh.paie.dtos.response.PaieMaterielTableauDto;
import staport.rh.paie.dtos.response.PaiePeriodeResumeDto;
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

    /** Mois qui contiennent de la paie, du plus récent au plus ancien, avec leur contenu résumé — alimente le
     * sélecteur de mois de l'assistant d'export (voir docs/paie/README.md). */
    List<PaiePeriodeResumeDto> findPeriodes();

    /** Tableaux du parc matériel prévus (chantier, équipe, titre, lignes) — l'assistant d'export s'en sert pour savoir
     * quels nombres demander, sans dupliquer la règle de {@code MaterielChantierCatalogue}. */
    List<PaieMaterielTableauDto> findTableauxMateriel();

    /** Chantiers d'un mois avec leurs équipes et effectifs, du plus gros (masse) au plus petit — alimente l'étape
     * « détail par équipe » de l'assistant d'export. */
    List<PaieChantierPeriodeDto> findChantiersDeLaPeriode(YearMonth periode);
}

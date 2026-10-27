package staport.rh.paie.services.interfaces;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import staport.rh.paie.dtos.request.PaieCreateRequestDto;
import staport.rh.paie.dtos.request.PaieSearchCriteria;
import staport.rh.paie.dtos.request.PaieOptionsChantierRequest;
import staport.rh.paie.dtos.request.PaieOptionsEquipeRequest;
import staport.rh.paie.dtos.request.PaieUpdateRequestDto;
import staport.rh.paie.dtos.response.PaieChantierPeriodeDto;
import staport.rh.paie.dtos.response.PaieMaterielTableauDto;
import staport.rh.paie.dtos.response.PaiePeriodeResumeDto;
import staport.rh.paie.dtos.response.PaieResponseDto;
import staport.rh.paie.dtos.response.PaieChantierOptionDto;
import staport.rh.paie.dtos.response.PaieEquipeOptionDto;

import java.time.YearMonth;
import java.util.List;
import java.util.Optional;

/**
 * Façade publique du module Paie — seule cette interface peut être injectée
 * par un autre domaine (conventions/architecture.md, section Encapsulation des domaines).
 */
public interface IPaieService {

    PaieResponseDto create(PaieCreateRequestDto dto);

    PaieResponseDto update(Long id, PaieUpdateRequestDto dto);

    PaieResponseDto findById(Long id);

    /** Bulletin exact d'un employé pour un mois, destiné aux domaines qui valident une paie mensuelle. */
    Optional<PaieResponseDto> findByEmployeeIdAndPeriode(Long employeeId, YearMonth periode);

    Page<PaieResponseDto> search(PaieSearchCriteria criteria, Pageable pageable);

    Page<PaieChantierOptionDto> rechercherOptionsChantiers(PaieOptionsChantierRequest requete, Pageable pageable);

    Page<PaieEquipeOptionDto> rechercherOptionsEquipes(PaieOptionsEquipeRequest requete, Pageable pageable);

    void delete(Long id);

    /**
     * Supprime d'un coup les bulletins que décrit {@code criteres} (le mois est obligatoire : on ne supprime jamais « toute la
     * paie » par erreur). {@code nombreAttendu} est le nombre confirmé par l'utilisateur : si le groupe en compte un autre
     * à cet instant, rien n'est supprimé ({@code PaieGroupeModifieException}). Retourne le nombre de bulletins supprimés.
     */
    long deleteGroupe(PaieSearchCriteria criteres, long nombreAttendu);

    /** Recrée un groupe depuis les instantanés d'une entrée de suppression du journal d'audit. */
    long restaurerGroupeDepuisAudit(Long idEntreeAudit);

    /** Mois qui contiennent de la paie, du plus récent au plus ancien, avec leur contenu résumé — alimente le sélecteur de
     * mois de l'assistant d'export et la vue Cartes (voir docs/paie/README.md). {@code criteres} filtre les bulletins
     * comptés (son mois est ignoré : on liste justement les mois) ; {@code null} = toute la paie. */
    List<PaiePeriodeResumeDto> findPeriodes(PaieSearchCriteria criteres);

    /** Tableaux du parc matériel prévus (chantier, équipe, titre, lignes) — l'assistant d'export s'en sert pour savoir
     * quels nombres demander, sans dupliquer la règle de {@code MaterielChantierCatalogue}. */
    List<PaieMaterielTableauDto> findTableauxMateriel();

    /** Chantiers d'un mois avec leurs équipes, effectifs et masses, du plus gros (masse) au plus petit — alimente l'étape
     * « détail par équipe » de l'assistant d'export et les niveaux chantier et équipe de la vue Cartes. {@code criteres}
     * filtre les bulletins comptés (son mois est ignoré : {@code periode} fait foi) ; {@code null} = tout le mois. */
    List<PaieChantierPeriodeDto> findChantiersDeLaPeriode(YearMonth periode, PaieSearchCriteria criteres);
}

package staport.rh.employee.services.interfaces;

import staport.rh.employee.dtos.request.EmployeeSearchCriteria;
import staport.rh.employee.dtos.response.EmployeeAnalytiqueDto;
import staport.rh.employee.dtos.response.EmployeeRegroupementDto;
import staport.rh.employee.dtos.response.EmployeeRegroupementsDto;
import staport.rh.employee.entities.DimensionEmployes;

import java.util.List;

/** Lecture agrégée des employés pour les vues Cartes et Analytique (état actuel des fiches, voir ADR 0010). */
public interface IEmployeeAnalytiqueService {

    /** Critère métier de tri des groupes d'effectif. */
    enum TriRegroupement { EFFECTIF, EN_POSTE, LIBELLE, CODE }

    /** Les groupes sont triés côté métier ; la borne de transport reste à l'adaptateur. */
    EmployeeRegroupementsDto regrouper(EmployeeSearchCriteria criteria, DimensionEmployes dimension,
                                       TriRegroupement tri, boolean ascendant);

    /** Compatibilité pour les vues métier qui demandent l'ordre par défaut et tous les groupes. */
    List<EmployeeRegroupementDto> regrouper(EmployeeSearchCriteria criteria, DimensionEmployes dimension);

    EmployeeAnalytiqueDto analyser(EmployeeSearchCriteria criteria);
}

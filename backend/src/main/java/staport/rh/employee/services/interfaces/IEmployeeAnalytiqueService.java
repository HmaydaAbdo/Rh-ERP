package staport.rh.employee.services.interfaces;

import staport.rh.employee.dtos.request.EmployeeSearchCriteria;
import staport.rh.employee.dtos.response.EmployeeAnalytiqueDto;
import staport.rh.employee.dtos.response.EmployeeRegroupementDto;
import staport.rh.employee.entities.DimensionEmployes;

import java.util.List;

/** Lecture agrégée des employés pour les vues Cartes et Analytique (état actuel des fiches, voir ADR 0010). */
public interface IEmployeeAnalytiqueService {

    /** Les employés du périmètre regroupés par chantier, équipe ou fonction, du groupe le plus grand au plus petit. */
    List<EmployeeRegroupementDto> regrouper(EmployeeSearchCriteria criteria, DimensionEmployes dimension);

    EmployeeAnalytiqueDto analyser(EmployeeSearchCriteria criteria);
}

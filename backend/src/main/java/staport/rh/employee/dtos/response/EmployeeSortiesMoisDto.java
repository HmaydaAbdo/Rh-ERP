package staport.rh.employee.dtos.response;

import java.time.YearMonth;
import java.util.List;
import java.util.Map;

/** Départs confirmés pour un mois, agrégés par motif et avec une liste nominative bornée. */
public record EmployeeSortiesMoisDto(YearMonth periode, long nombre, Map<String, Long> parMotif,
                                     List<EmployeeSortieDto> sorties) {
}

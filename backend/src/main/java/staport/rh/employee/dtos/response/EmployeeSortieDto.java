package staport.rh.employee.dtos.response;

import java.time.YearMonth;

/** Un départ de l'entreprise : le mois de la paie qui l'a constaté et son motif (« STC » ou saisi). */
public record EmployeeSortieDto(YearMonth periode, String motif) {
}

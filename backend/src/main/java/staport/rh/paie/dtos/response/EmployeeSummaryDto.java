package staport.rh.paie.dtos.response;

public record EmployeeSummaryDto(
        Long id,
        String nomPrenom,
        String cin
) {
}

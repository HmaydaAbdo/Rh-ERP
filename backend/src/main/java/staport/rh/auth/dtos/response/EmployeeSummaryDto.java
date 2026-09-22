package staport.rh.auth.dtos.response;

public record EmployeeSummaryDto(
        Long id,
        String nomPrenom,
        String cin
) {
}

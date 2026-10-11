package staport.rh.auth.dtos.response;

public record PermissionResponseDto(
        Long id,
        Long version,
        String code,
        String description
) {
}

package staport.rh.auth.dtos.response;

public record PermissionResponseDto(
        Long id,
        String code,
        String description
) {
}

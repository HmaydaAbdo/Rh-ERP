package staport.rh.chantier.dtos.response;

public record ChantierResponseDto(
        Long id,
        String code,
        String designation,
        boolean sourceErp,
        boolean actif
) {
}

package staport.rh.chantier.dtos.response;

public record ChantierResponseDto(
        Long id,
        Long version,
        String code,
        String designation,
        String nom,
        boolean sourceErp,
        boolean actif
) {
}

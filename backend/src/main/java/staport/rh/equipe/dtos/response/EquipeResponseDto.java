package staport.rh.equipe.dtos.response;

public record EquipeResponseDto(
        Long id,
        Long version,
        String code,
        String libelle
) {
}

package staport.rh.chantier.dtos.request;

public record ChantierSearchCriteria(
        String code,
        String designation,
        Boolean actif
) {
}

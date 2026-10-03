package staport.rh.chantier.sync;

public record ChantierSyncResultDto(
        int totalRecus,
        int crees,
        int dejaPresents,
        int ignores
) {
}

package staport.rh.audit.dtos.response;

import java.util.List;

/**
 * Un champ qui change. Valeurs déjà formatées pour la lecture ; une relation s'écrit {@code "<id> — <libellé>"}
 * (conventions/audit.md). Une collection de droits n'a pas d'avant / après mais des éléments {@code ajoutes} et {@code retires}.
 */
public record AuditChampDto(String champ, String avant, String apres, List<String> ajoutes, List<String> retires) {

    public static AuditChampDto valeur(String champ, String avant, String apres) {
        return new AuditChampDto(champ, avant, apres, null, null);
    }

    public static AuditChampDto collection(String champ, List<String> ajoutes, List<String> retires) {
        return new AuditChampDto(champ, null, null, ajoutes, retires);
    }
}

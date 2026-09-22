package staport.rh.chantier.sync;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Forme brute d'une ligne renvoyée par l'ERP (webServiceBS/getChantiers).
 * {@code codeErreur} est un statut de ligne côté ERP, pas une donnée du chantier ; il n'est pas
 * utilisé par la synchronisation (voir {@link ChantierSyncService}) — conservé ici uniquement pour
 * représenter fidèlement la réponse brute de l'ERP.
 */
public record ChantierErpDto(
        @JsonProperty("id_chantier") Long idChantier,
        @JsonProperty("designation") String designation,
        @JsonProperty("code") String code,
        @JsonProperty("CodeErreur") Integer codeErreur
) {
}

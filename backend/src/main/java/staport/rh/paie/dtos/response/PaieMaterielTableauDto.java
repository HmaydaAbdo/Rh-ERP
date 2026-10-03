package staport.rh.paie.dtos.response;

import java.util.List;

/** Un tableau du parc matériel (ex. CAMION du chantier C168, équipe CH) : ses lignes sont celles dont l'assistant
 * d'export demande le nombre. */
public record PaieMaterielTableauDto(
        String chantierCode,
        String equipeCode,
        String titre,
        List<String> libelles
) {
}

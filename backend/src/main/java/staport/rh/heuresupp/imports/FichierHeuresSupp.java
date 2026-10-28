package staport.rh.heuresupp.imports;

import java.util.List;

/** Résumé de lecture : les lignes sans heures sont comptabilisées pour le récapitulatif, jamais importées. */
public record FichierHeuresSupp(List<LigneFichierHeuresSupp> lignes, int lignesZero, int totalLignes) {
    public FichierHeuresSupp {
        lignes = List.copyOf(lignes);
    }
}

package staport.rh.heuresupp.imports;

import java.math.BigDecimal;

/** Données source du fichier ; S/H et l'identité de référence viennent de l'ERP après rapprochement par CIN. */
public record LigneFichierHeuresSupp(int numeroLigne, String nom, String prenom, String cin, String fonction, BigDecimal heures) {

    public String nomPrenom() {
        return String.join(" ", nom == null ? "" : nom.strip(), prenom == null ? "" : prenom.strip()).strip();
    }
}

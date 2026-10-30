package staport.rh.heuresupp.imports;

import java.math.BigDecimal;

/** Données source du fichier ; S/H et l'identité de référence viennent de l'ERP après rapprochement par CIN. */
public record LigneFichierHeuresSupp(int numeroLigne, String nomPrenom, String cin, BigDecimal heures) {

}

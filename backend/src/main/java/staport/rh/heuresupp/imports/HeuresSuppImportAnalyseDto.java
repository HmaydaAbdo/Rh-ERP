package staport.rh.heuresupp.imports;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.List;

/** Analyse en lecture seule ; le wizard ne confirme l'import que si toutes les lignes sont prêtes. */
public record HeuresSuppImportAnalyseDto(
        YearMonth periode,
        Long chantierId,
        int totalLignes,
        int lignesZeroIgnorees,
        List<Ligne> lignes,
        List<String> erreurs,
        boolean pret
) {

    public HeuresSuppImportAnalyseDto {
        lignes = List.copyOf(lignes);
        erreurs = List.copyOf(erreurs);
    }

    public record Ligne(
            int numeroLigne,
            String cin,
            String nomPrenom,
            String fonction,
            Long employeId,
            String nomFichier,
            String fonctionFichier,
            boolean identiteEcart,
            boolean fonctionEcart,
            boolean forfaitSeul,
            BigDecimal heuresSupplementaires,
            BigDecimal salaireHoraireDh,
            BigDecimal montantDh,
            boolean stcOuSortie,
            BigDecimal stcDh,
            BigDecimal forfaitDh,
            BigDecimal netAPayerDh,
            List<String> erreurs
    ) {
        public Ligne {
            erreurs = List.copyOf(erreurs);
        }
    }
}

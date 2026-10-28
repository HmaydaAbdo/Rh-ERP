package staport.rh.mcp.outils;

import org.junit.jupiter.api.Test;
import staport.rh.heuresupp.dtos.response.HeuresSuppAnalytiqueDto;
import staport.rh.heuresupp.services.HeuresSuppAnalytiqueService;
import staport.rh.heuresupp.services.interfaces.IHeuresSuppService;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class OutilsHeuresSuppTest {

    @Test
    void les_indicateurs_mcp_rendent_tous_les_groupes_du_domaine() {
        HeuresSuppAnalytiqueService analytique = mock(HeuresSuppAnalytiqueService.class);
        YearMonth periode = YearMonth.of(2026, 10);
        List<HeuresSuppAnalytiqueDto.Groupe> groupes = java.util.stream.IntStream.range(0, 25)
                .mapToObj(id -> new HeuresSuppAnalytiqueDto.Groupe((long) id, "C" + id, "Chantier " + id,
                        1, 1, BigDecimal.ONE, BigDecimal.ONE, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ONE))
                .toList();
        var resultat = new HeuresSuppAnalytiqueDto(periode,
                new HeuresSuppAnalytiqueDto.Indicateurs(25, 25, BigDecimal.ONE, BigDecimal.ONE,
                        BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ONE),
                groupes, groupes, groupes,
                new HeuresSuppAnalytiqueDto.Definitions("heures", "montant", "STC", "forfait", "net"));
        when(analytique.analyser(org.mockito.ArgumentMatchers.any())).thenReturn(resultat);
        OutilsHeuresSupp outils = new OutilsHeuresSupp(mock(IHeuresSuppService.class), analytique);

        Map<String, Object> reponse = outils.indicateurs(periode.toString());
        @SuppressWarnings("unchecked")
        Map<String, Object> donnees = (Map<String, Object>) reponse.get("resultats");

        assertThat((List<?>) donnees.get("parChantier")).hasSize(25);
        assertThat((List<?>) donnees.get("parFonction")).hasSize(25);
        assertThat((List<?>) donnees.get("parEquipe")).hasSize(25);
    }
}

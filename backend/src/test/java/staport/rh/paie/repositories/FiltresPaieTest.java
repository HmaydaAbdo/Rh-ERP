package staport.rh.paie.repositories;

import org.junit.jupiter.api.Test;
import staport.rh.paie.dtos.request.PaieSearchCriteria;

import java.time.YearMonth;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class FiltresPaieTest {

    @Test
    void depuis_devraitIgnorerLesFiltresAbsentsOuVides() {
        FiltresPaie filtres = FiltresPaie.depuis(new PaieSearchCriteria("  ", null, YearMonth.of(2026, 8), List.of(), null, List.of()));

        assertThat(filtres.isTousNoms()).isTrue();
        assertThat(filtres.isTousCin()).isTrue();
        assertThat(filtres.isTousChantiers()).isTrue();
        assertThat(filtres.isToutesFonctions()).isTrue();
        assertThat(filtres.isToutesEquipes()).isTrue();
        // Jamais de liste vide : « IN () » n'est pas du SQL valide.
        assertThat(filtres.getChantierIds()).isNotEmpty();
        assertThat(filtres.getEquipeIds()).isNotEmpty();
    }

    @Test
    void depuis_devraitTransmettreLesFiltresRenseignes() {
        FiltresPaie filtres = FiltresPaie.depuis(new PaieSearchCriteria("AB1", "ali", null, List.of(2L), List.of(3L, 4L), List.of(5L)));

        assertThat(filtres.isTousCin()).isFalse();
        assertThat(filtres.getMotifCin()).isEqualTo("%ab1%");
        assertThat(filtres.getMotifNom()).isEqualTo("%ali%");
        assertThat(filtres.getFonctionIds()).containsExactly(2L);
        assertThat(filtres.getChantierIds()).containsExactly(3L, 4L);
        assertThat(filtres.getEquipeIds()).containsExactly(5L);
    }

    @Test
    void depuis_devraitInclureLesBulletinsSansEquipeAvecLeSentinelleZero() {
        FiltresPaie filtres = FiltresPaie.depuis(new PaieSearchCriteria(null, null, null, null, null, List.of(0L, 5L)));

        assertThat(filtres.isToutesEquipes()).isFalse();
        assertThat(filtres.isInclureSansEquipe()).isTrue();
        assertThat(filtres.getEquipeIds()).containsExactly(5L);
    }

    @Test
    void depuis_devraitRenvoyerAucunFiltreSansCriteres() {
        assertThat(FiltresPaie.depuis(null)).isSameAs(FiltresPaie.AUCUN);
    }
}

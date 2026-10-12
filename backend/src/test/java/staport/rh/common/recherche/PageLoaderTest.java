package staport.rh.common.recherche;

import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class PageLoaderTest {

    @Test
    void parcourtToutesLesPagesAvecUneTailleBornee() {
        List<Pageable> demandes = new ArrayList<>();
        List<Integer> valeurs = new ArrayList<>();

        PageLoader.forEach(pageable -> {
            demandes.add(pageable);
            return pageable.getPageNumber() == 0
                    ? new PageImpl<>(List.of(1, 2), pageable, 3)
                    : new PageImpl<>(List.of(3), pageable, 3);
        }, valeurs::add);

        assertThat(valeurs).containsExactly(1, 2, 3);
        assertThat(demandes).extracting(Pageable::getPageNumber).containsExactly(0, 1);
        assertThat(demandes).allMatch(pageable -> pageable.getPageSize() == PageLoader.PAGE_SIZE);
    }
}

package staport.rh.common;

import org.junit.jupiter.api.Test;
import staport.rh.common.exception.ConflitModificationException;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class VersionOptimisteTest {

    @Test
    void accepte_la_version_lue_par_le_client() {
        assertThatCode(() -> VersionOptimiste.verifier(3L, 3L)).doesNotThrowAnyException();
    }

    @Test
    void refuse_une_version_perimee() {
        assertThatThrownBy(() -> VersionOptimiste.verifier(2L, 3L))
                .isInstanceOf(ConflitModificationException.class);
    }

    @Test
    void refuse_une_version_absente() {
        assertThatThrownBy(() -> VersionOptimiste.verifier(null, 3L))
                .isInstanceOf(ConflitModificationException.class);
    }
}

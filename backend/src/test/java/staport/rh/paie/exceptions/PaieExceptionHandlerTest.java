package staport.rh.paie.exceptions;

import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import staport.rh.common.dtos.ErrorResponseDto;

import static org.assertj.core.api.Assertions.assertThat;

class PaieExceptionHandlerTest {

    private final PaieExceptionHandler handler = new PaieExceptionHandler();

    @Test
    void une_violation_d_integrite_est_un_conflit_sans_exposer_le_detail_sql() {
        HttpServletRequest request = new MockHttpServletRequest("POST", "/paie");

        ResponseEntity<ErrorResponseDto> response = handler.handleDataIntegrityViolation(
                new DataIntegrityViolationException("détail SQL confidentiel"), request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody().message()).isEqualTo("Une contrainte d'intégrité empêche cette opération.");
        assertThat(response.getBody().message()).doesNotContain("détail SQL confidentiel");
    }
}

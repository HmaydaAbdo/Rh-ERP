package staport.rh.common.logging;

import jakarta.servlet.ServletException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import staport.rh.audit.context.ResolveurContexteAudit;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

class MdcRequestFilterTest {

    private final MdcRequestFilter filtre = new MdcRequestFilter();

    @AfterEach
    void nettoyerContexte() {
        MDC.clear();
    }

    @Test
    void genere_et_propage_un_identifiant_de_correlation_sans_identite_personnelle() throws Exception {
        MockHttpServletRequest requete = new MockHttpServletRequest();
        requete.addHeader(MdcRequestFilter.EN_TETE_REQUEST_ID, "identifiant-fourni-par-le-client");
        MockHttpServletResponse reponse = new MockHttpServletResponse();

        filtre.doFilterInternal(requete, reponse, (req, res) -> {
            String requestId = MDC.get(ResolveurContexteAudit.MDC_REQUEST_ID);
            UUID.fromString(requestId);
            assertEquals(requestId, ((MockHttpServletResponse) res).getHeader(MdcRequestFilter.EN_TETE_REQUEST_ID));
            assertNotEquals("identifiant-fourni-par-le-client", requestId);
            assertNull(MDC.get("userId"));
        });

        assertNull(MDC.get(ResolveurContexteAudit.MDC_REQUEST_ID));
    }

    @Test
    void nettoie_le_contexte_meme_si_le_traitement_echoue() {
        MockHttpServletRequest requete = new MockHttpServletRequest();
        MockHttpServletResponse reponse = new MockHttpServletResponse();

        assertThrows(ServletException.class, () -> filtre.doFilterInternal(requete, reponse, (req, res) -> {
            UUID.fromString(MDC.get(ResolveurContexteAudit.MDC_REQUEST_ID));
            throw new ServletException("échec synthétique");
        }));

        assertNull(MDC.get(ResolveurContexteAudit.MDC_REQUEST_ID));
    }
}

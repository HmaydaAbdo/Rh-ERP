package staport.rh.common.logging;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.core.task.TaskDecorator;
import staport.rh.audit.context.ResolveurContexteAudit;
import staport.rh.common.config.AsyncConfig;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class MdcRequestIdTaskDecoratorTest {

    private final TaskDecorator decorator = new AsyncConfig().mdcRequestIdTaskDecorator();

    @AfterEach
    void nettoyerContexte() {
        MDC.clear();
    }

    @Test
    void propage_le_request_id_et_nettoie_le_contexte_du_worker() {
        MDC.put(ResolveurContexteAudit.MDC_REQUEST_ID, "requete-http");
        Runnable tache = decorator.decorate(() -> assertEquals("requete-http",
                MDC.get(ResolveurContexteAudit.MDC_REQUEST_ID)));
        MDC.clear();

        tache.run();

        assertNull(MDC.get(ResolveurContexteAudit.MDC_REQUEST_ID));
    }

    @Test
    void restaure_le_contexte_preexistant_du_worker_apres_la_tache() {
        MDC.put(ResolveurContexteAudit.MDC_REQUEST_ID, "requete-source");
        Runnable tache = decorator.decorate(() -> assertEquals("requete-source",
                MDC.get(ResolveurContexteAudit.MDC_REQUEST_ID)));
        MDC.put(ResolveurContexteAudit.MDC_REQUEST_ID, "contexte-worker");

        tache.run();

        assertEquals("contexte-worker", MDC.get(ResolveurContexteAudit.MDC_REQUEST_ID));
    }
}

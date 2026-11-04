package staport.rh.common.config;

import org.junit.jupiter.api.Test;
import org.springframework.http.server.observation.ServerRequestObservationContext;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import io.micrometer.observation.Observation;

import static org.assertj.core.api.Assertions.assertThat;

class ObservationSansActuatorTest {

    private final ObservationSansActuator predicat = new ObservationSansActuator();

    private static ServerRequestObservationContext requete(String chemin) {
        return new ServerRequestObservationContext(new MockHttpServletRequest("GET", chemin), new MockHttpServletResponse());
    }

    @Test
    void la_sante_et_les_metriques_ne_sont_pas_observees() {
        assertThat(predicat.test("http.server.requests", requete("/actuator/health"))).isFalse();
        assertThat(predicat.test("http.server.requests", requete("/actuator/health/readiness"))).isFalse();
        assertThat(predicat.test("http.server.requests", requete("/actuator/prometheus"))).isFalse();
        assertThat(predicat.test("http.server.requests", requete("/actuator"))).isFalse();
    }

    @Test
    void les_requetes_metier_et_les_autres_observations_restent_tracees() {
        assertThat(predicat.test("http.server.requests", requete("/parametres"))).isTrue();
        assertThat(predicat.test("http.server.requests", requete("/actuators-ressemble"))).isTrue();
        assertThat(predicat.test("spring.security.filterchains", new Observation.Context())).isTrue();
    }
}

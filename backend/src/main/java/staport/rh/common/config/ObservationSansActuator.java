package staport.rh.common.config;

import io.micrometer.observation.Observation;
import io.micrometer.observation.ObservationPredicate;
import org.springframework.http.server.observation.ServerRequestObservationContext;
import org.springframework.stereotype.Component;

/**
 * Les sondes de santé et le scraping Prometheus (`/actuator/...`) reviennent toutes les quelques secondes : sans ce
 * filtre, elles noient les traces Phoenix. Mécanisme officiel de Spring Boot (bean {@link ObservationPredicate}) : la
 * requête n'est ni observée ni tracée ; les métriques de santé de Docker ne dépendent pas de cette observation.
 */
@Component
class ObservationSansActuator implements ObservationPredicate {

    private static final String PREFIXE_ACTUATOR = "/actuator";

    @Override
    public boolean test(String nom, Observation.Context contexte) {
        if (contexte instanceof ServerRequestObservationContext requete) {
            String chemin = requete.getCarrier().getRequestURI();
            return chemin == null || !(chemin.equals(PREFIXE_ACTUATOR) || chemin.startsWith(PREFIXE_ACTUATOR + "/"));
        }
        return true;
    }
}

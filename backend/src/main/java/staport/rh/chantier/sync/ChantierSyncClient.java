package staport.rh.chantier.sync;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.List;

/**
 * Accès au webservice ERP externe (webServiceBS/getChantiers). Aucune logique métier ici :
 * uniquement l'appel HTTP et la désérialisation de la réponse brute. Les délais sont bornés par
 * configuration ; une erreur est propagée au service appelant et aucun retry automatique n'est
 * effectué, car la source est un export complet et la reprise doit rester pilotée par la prochaine
 * exécution planifiée ou par un déclenchement manuel.
 */
@Component
public class ChantierSyncClient {

    private final RestClient restClient;

    public ChantierSyncClient(@Value("${chantier.sync.base-url}") String baseUrl,
                              @Value("${chantier.sync.connect-timeout:5s}") Duration connectTimeout,
                              @Value("${chantier.sync.read-timeout:30s}") Duration readTimeout) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(connectTimeout);
        requestFactory.setReadTimeout(readTimeout);
        this.restClient = RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(requestFactory)
                .build();
    }

    public List<ChantierErpDto> fetchChantiers() {
        ChantierErpDto[] response = restClient.get()
                .retrieve()
                .body(ChantierErpDto[].class);
        return response != null ? List.of(response) : List.of();
    }
}

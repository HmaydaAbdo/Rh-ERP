package staport.rh.chantier.sync;

import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

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

    public ChantierSyncClient(ChantierSyncProperties properties) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(properties.getConnectTimeout());
        requestFactory.setReadTimeout(properties.getReadTimeout());
        this.restClient = RestClient.builder()
                .baseUrl(properties.getBaseUrl())
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

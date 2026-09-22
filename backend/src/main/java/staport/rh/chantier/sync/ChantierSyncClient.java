package staport.rh.chantier.sync;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.List;

/**
 * Accès au webservice ERP externe (webServiceBS/getChantiers). Aucune logique métier ici :
 * uniquement l'appel HTTP et la désérialisation de la réponse brute.
 */
@Component
public class ChantierSyncClient {

    private final RestClient restClient;

    public ChantierSyncClient(@Value("${chantier.sync.base-url}") String baseUrl) {
        this.restClient = RestClient.builder().baseUrl(baseUrl).build();
    }

    public List<ChantierErpDto> fetchChantiers() {
        ChantierErpDto[] response = restClient.get()
                .retrieve()
                .body(ChantierErpDto[].class);
        return response != null ? List.of(response) : List.of();
    }
}

package staport.rh.chantier.sync;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.HttpServerErrorException;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ChantierSyncClientTest {

    private HttpServer serveur;

    @BeforeEach
    void demarrerServeur() throws IOException {
        serveur = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        serveur.start();
    }

    @AfterEach
    void arreterServeur() {
        if (serveur != null) {
            serveur.stop(0);
        }
    }

    private ChantierSyncClient client() {
        ChantierSyncProperties properties = new ChantierSyncProperties();
        properties.setBaseUrl("http://127.0.0.1:" + serveur.getAddress().getPort() + "/chantiers");
        properties.setConnectTimeout(Duration.ofSeconds(1));
        properties.setReadTimeout(Duration.ofSeconds(1));
        return new ChantierSyncClient(properties);
    }

    @Test
    void fetchChantiers_deserialiseLaReponseBruteDeLErp() {
        serveur.createContext("/chantiers", echange -> {
            byte[] corps = "[{\"id_chantier\":7,\"designation\":\"Voirie\",\"code\":\"C007\",\"CodeErreur\":3}]"
                    .getBytes(StandardCharsets.UTF_8);
            echange.getResponseHeaders().add("Content-Type", "application/json");
            echange.sendResponseHeaders(200, corps.length);
            echange.getResponseBody().write(corps);
            echange.close();
        });

        var resultats = client().fetchChantiers();

        assertThat(resultats).containsExactly(new ChantierErpDto(7L, "Voirie", "C007", 3));
    }

    @Test
    void fetchChantiers_propageUneReponseHttpEnErreur() {
        serveur.createContext("/chantiers", echange -> {
            echange.sendResponseHeaders(503, -1);
            echange.close();
        });

        assertThatThrownBy(() -> client().fetchChantiers())
                .isInstanceOf(HttpServerErrorException.class);
    }
}

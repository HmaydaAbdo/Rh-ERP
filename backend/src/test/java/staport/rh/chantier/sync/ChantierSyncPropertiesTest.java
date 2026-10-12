package staport.rh.chantier.sync;

import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ChantierSyncPropertiesTest {

    @Test
    void accepteUneUrlHttpEtDesDelaisPositifs() {
        ChantierSyncProperties properties = new ChantierSyncProperties();
        properties.setBaseUrl("https://erp.example.test/getChantiers");
        properties.validate();
    }

    @Test
    void refuseUneUrlSansHoteHttp() {
        ChantierSyncProperties properties = new ChantierSyncProperties();
        properties.setBaseUrl("file:///tmp/chantiers.json");

        assertThatThrownBy(properties::validate)
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("HTTP ou HTTPS");
    }

    @Test
    void refuseUnDelaiNul() {
        ChantierSyncProperties properties = new ChantierSyncProperties();
        properties.setBaseUrl("https://erp.example.test/getChantiers");
        properties.setReadTimeout(Duration.ZERO);

        assertThatThrownBy(properties::validate)
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("strictement positifs");
    }
}

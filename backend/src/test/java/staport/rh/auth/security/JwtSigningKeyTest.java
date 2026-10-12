package staport.rh.auth.security;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtSigningKeyTest {

    @Test
    void accepteUnSecretDauMoins256Bits() {
        String secret = Base64.getEncoder().encodeToString(new byte[32]);

        assertThat(JwtSigningKey.depuisBase64(secret).getEncoded()).hasSize(32);
    }

    @Test
    void refuseUnSecretBase64TropCourt() {
        String secret = Base64.getEncoder().encodeToString("trop-court".getBytes(StandardCharsets.UTF_8));

        assertThatThrownBy(() -> JwtSigningKey.depuisBase64(secret))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("256 bits");
    }

    @Test
    void refuseUnSecretQuiNestPasBase64() {
        assertThatThrownBy(() -> JwtSigningKey.depuisBase64("pas-base64!"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Base64 valide");
    }
}

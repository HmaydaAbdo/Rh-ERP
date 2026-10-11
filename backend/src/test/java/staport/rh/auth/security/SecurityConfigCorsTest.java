package staport.rh.auth.security;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SecurityConfigCorsTest {

    @Test
    void conserveLesOriginesDeclareesSansWildcard() {
        SecurityConfig config = new SecurityConfig("secret", false,
                "http://localhost:4200, https://rh.example.com");

        var cors = config.corsConfigurationSource()
                .getCorsConfiguration(new MockHttpServletRequest("GET", "/employees"));

        assertThat(cors).isNotNull();
        assertThat(cors.getAllowedOrigins())
                .containsExactly("http://localhost:4200", "https://rh.example.com");
        assertThat(cors.getAllowCredentials()).isTrue();
    }

    @Test
    void refuseUneOrigineNonConforme() {
        assertThatThrownBy(() -> new SecurityConfig("secret", false, "*"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Origine CORS invalide");
    }

    @Test
    void refuseUneValeurVide() {
        assertThatThrownBy(() -> new SecurityConfig("secret", false, "http://localhost:4200,"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("CORS_ALLOWED_ORIGINS");
    }

    @Test
    void refuseUneOrigineAvecUnChemin() {
        assertThatThrownBy(() -> new SecurityConfig("secret", false, "https://rh.example.com/rh-erp"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Origine CORS invalide");
    }
}

package staport.rh.audit.support;

import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.time.Instant;
import java.util.Arrays;

/** Pose, dans le thread du test, l'identité qu'aurait une requête authentifiée par un Access Token. */
public final class AuthentificationDeTest {

    private AuthentificationDeTest() {
    }

    public static void connecter(long utilisateurId, String username, String... autorites) {
        Jwt jwt = Jwt.withTokenValue("jeton-de-test")
                .header("alg", "HS256")
                .subject(username)
                .claim("uid", utilisateurId)
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(900))
                .build();
        SecurityContext contexte = SecurityContextHolder.createEmptyContext();
        contexte.setAuthentication(new JwtAuthenticationToken(jwt,
                Arrays.stream(autorites).map(SimpleGrantedAuthority::new).toList()));
        SecurityContextHolder.setContext(contexte);
    }

    public static void deconnecter() {
        SecurityContextHolder.clearContext();
    }
}

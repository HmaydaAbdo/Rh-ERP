package staport.rh.auth.security;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import staport.rh.auth.entities.Utilisateur;

import javax.crypto.spec.SecretKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.List;
import java.util.Set;

/**
 * Émission des Access Tokens (JWT auto-émis, HS256 — voir conventions/security.md). La validation
 * (signature + expiration) est déléguée au {@code JwtDecoder} de Spring Security OAuth2 Resource
 * Server (voir {@link SecurityConfig}), configuré avec le même secret.
 */
@Service
public class JwtService {

    public static final Duration ACCESS_TOKEN_TTL = Duration.ofMinutes(15);

    private static final String CLAIM_PERMISSIONS = "permissions";
    private static final String CLAIM_ROLES = "roles";
    private static final String CLAIM_USER_ID = "uid";

    private final SecretKeySpec signingKey;
    private final String issuer;

    public JwtService(@Value("${security.jwt.secret}") String base64Secret,
                       @Value("${spring.application.name}") String issuer) {
        this.signingKey = new SecretKeySpec(Base64.getDecoder().decode(base64Secret), "HmacSHA256");
        this.issuer = issuer;
    }

    public String genererAccessToken(Utilisateur utilisateur, Set<String> permissions, Set<String> roles) {
        Instant maintenant = Instant.now();
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .subject(utilisateur.getUsername())
                .issuer(issuer)
                .issueTime(Date.from(maintenant))
                .expirationTime(Date.from(maintenant.plus(ACCESS_TOKEN_TTL)))
                .claim(CLAIM_USER_ID, utilisateur.getId())
                .claim(CLAIM_PERMISSIONS, List.copyOf(permissions))
                .claim(CLAIM_ROLES, List.copyOf(roles))
                .build();

        try {
            SignedJWT signedJwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims);
            signedJwt.sign(new MACSigner(signingKey));
            return signedJwt.serialize();
        } catch (JOSEException e) {
            throw new IllegalStateException("Erreur lors de la signature du JWT : " + e.getMessage(), e);
        }
    }
}

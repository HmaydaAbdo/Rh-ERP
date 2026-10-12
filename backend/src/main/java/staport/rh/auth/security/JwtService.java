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
import staport.rh.parametre.services.interfaces.IParametreService;

import javax.crypto.spec.SecretKeySpec;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Set;

/**
 * Émission des Access Tokens (JWT auto-émis, HS256 — voir conventions/security.md). La validation
 * (signature, algorithme, émetteur, destinataire et claims temporels requis) est déléguée au
 * {@code JwtDecoder} de Spring Security OAuth2 Resource Server (voir {@link SecurityConfig}).
 */
@Service
public class JwtService {

    private static final String CLAIM_PERMISSIONS = "permissions";
    private static final String CLAIM_ROLES = "roles";
    private static final String CLAIM_USER_ID = "uid";

    private final SecretKeySpec signingKey;
    private final String issuer;
    private final IParametreService parametres;

    public JwtService(@Value("${security.jwt.secret}") String base64Secret,
                       @Value("${spring.application.name}") String issuer,
                       IParametreService parametres) {
        this.signingKey = JwtSigningKey.depuisBase64(base64Secret);
        this.issuer = issuer;
        this.parametres = parametres;
    }

    public String genererAccessToken(Utilisateur utilisateur, Set<String> permissions, Set<String> roles) {
        Instant maintenant = Instant.now();
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .subject(utilisateur.getUsername())
                .issuer(issuer)
                .audience(issuer)
                .issueTime(Date.from(maintenant))
                .expirationTime(Date.from(maintenant.plus(parametres.dureeJetonAcces())))
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

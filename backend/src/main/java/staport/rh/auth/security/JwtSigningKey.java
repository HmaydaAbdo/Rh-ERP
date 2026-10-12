package staport.rh.auth.security;

import javax.crypto.spec.SecretKeySpec;
import java.util.Base64;

/** Validation commune du secret HMAC JWT avant signature ou vérification. */
final class JwtSigningKey {

    private static final int LONGUEUR_MINIMALE_OCTETS = 32;

    private JwtSigningKey() {
    }

    static SecretKeySpec depuisBase64(String secretBase64) {
        final byte[] secret;
        try {
            secret = Base64.getDecoder().decode(secretBase64);
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("JWT_SECRET doit être un secret Base64 valide d'au moins 256 bits");
        }
        if (secret.length < LONGUEUR_MINIMALE_OCTETS) {
            throw new IllegalArgumentException("JWT_SECRET doit contenir au moins 256 bits après décodage Base64");
        }
        return new SecretKeySpec(secret, "HmacSHA256");
    }
}

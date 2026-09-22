package staport.rh.auth.security;

import org.springframework.stereotype.Component;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * Génération/hachage des tokens opaques (Refresh Token, lien de réinitialisation) — SHA-256 (pas
 * BCrypt) : contrairement à un mot de passe, un token aléatoire de 256 bits n'est pas exposé au
 * brute-force, un hash rapide suffit et évite de ralentir chaque refresh.
 */
@Component
public class TokenHasher {

    private static final SecureRandom RANDOM = new SecureRandom();

    public String genererTokenBrut() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    public String hasher(String tokenBrut) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(tokenBrut.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 indisponible", e);
        }
    }
}

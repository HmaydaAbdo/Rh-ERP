package staport.rh.support;

import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;

import java.util.Base64;

/** Clés RSA 3072 bits des jetons agent pour les tests qui activent MCP (format des variables MCP_JWT_*). */
public final class ClesAgentDeTest {

    private ClesAgentDeTest() {
    }

    public static RSAKey generer(String kid) {
        try {
            return new RSAKeyGenerator(3072).keyID(kid).generate();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** Base64 du PKCS#8 DER, comme {@code MCP_JWT_PRIVATE_KEY}. */
    public static String base64Prive(RSAKey cle) {
        try {
            return Base64.getEncoder().encodeToString(cle.toPrivateKey().getEncoded());
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** Base64 du X.509 DER, comme {@code MCP_JWT_PREVIOUS_PUBLIC_KEY}. */
    public static String base64Public(RSAKey cle) {
        try {
            return Base64.getEncoder().encodeToString(cle.toPublicKey().getEncoded());
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}

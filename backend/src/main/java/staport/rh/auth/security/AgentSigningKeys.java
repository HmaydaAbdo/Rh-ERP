package staport.rh.auth.security;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.KeyUse;
import com.nimbusds.jose.jwk.RSAKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.interfaces.RSAPrivateCrtKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.RSAPublicKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Clés RS256 des jetons délégués de l'agent IA (docs/ia.md, § 5). La clé privée courante signe ; la clé publique
 * précédente, facultative, reste acceptée pendant un changement de clé. Fournies par l'environnement
 * (.env racine), en base64 d'un DER : PKCS#8 pour la clé privée, X.509 (SubjectPublicKeyInfo) pour la clé publique.
 *
 * <p>MCP désactivé : aucune clé n'est lue et {@link #courante()} est vide. MCP activé : une clé absente, illisible,
 * de moins de {@value #TAILLE_MINIMALE} bits ou sans identifiant empêche le démarrage.
 */
@Component
public class AgentSigningKeys {

    static final int TAILLE_MINIMALE = 3072;

    private final RSAKey courante;
    private final JWKSet publiques;

    public AgentSigningKeys(@Value("${security.mcp.enabled}") boolean mcpActive,
                            @Value("${security.mcp.private-key}") String clePriveeBase64,
                            @Value("${security.mcp.key-id}") String identifiantCle,
                            @Value("${security.mcp.previous-public-key}") String clePubliquePrecedenteBase64,
                            @Value("${security.mcp.previous-key-id}") String identifiantClePrecedente) {
        if (!mcpActive) {
            this.courante = null;
            this.publiques = new JWKSet();
            return;
        }
        this.courante = clePrivee(obligatoire(clePriveeBase64, "MCP_JWT_PRIVATE_KEY"),
                obligatoire(identifiantCle, "MCP_JWT_KEY_ID"));
        List<com.nimbusds.jose.jwk.JWK> cles = new ArrayList<>(List.of(courante.toPublicJWK()));
        if (!estVide(clePubliquePrecedenteBase64)) {
            String kidPrecedent = obligatoire(identifiantClePrecedente, "MCP_JWT_PREVIOUS_KEY_ID");
            if (kidPrecedent.equals(courante.getKeyID())) {
                throw new IllegalStateException("MCP_JWT_PREVIOUS_KEY_ID doit différer de MCP_JWT_KEY_ID");
            }
            cles.add(clePublique(clePubliquePrecedenteBase64, kidPrecedent));
        }
        this.publiques = new JWKSet(cles);
    }

    /** Clé de signature courante ; vide quand MCP est désactivé. */
    public Optional<RSAKey> courante() {
        return Optional.ofNullable(courante);
    }

    /** Clés publiques acceptées (courante puis précédente) ; jamais de partie privée. */
    public JWKSet publiques() {
        return publiques;
    }

    /** Document JWKS publié : uniquement des clés publiques. */
    public Map<String, Object> jwksPublic() {
        return publiques.toJSONObject(true);
    }

    private static RSAKey clePrivee(String base64, String kid) {
        try {
            KeyFactory fabrique = KeyFactory.getInstance("RSA");
            var privee = (RSAPrivateCrtKey) fabrique.generatePrivate(new PKCS8EncodedKeySpec(decoder(base64, "MCP_JWT_PRIVATE_KEY")));
            var publique = (RSAPublicKey) fabrique.generatePublic(
                    new RSAPublicKeySpec(privee.getModulus(), privee.getPublicExponent()));
            verifierTaille(publique, "MCP_JWT_PRIVATE_KEY");
            return new RSAKey.Builder(publique).privateKey(privee).keyID(kid)
                    .keyUse(KeyUse.SIGNATURE).algorithm(JWSAlgorithm.RS256).build();
        } catch (GeneralSecurityException | ClassCastException e) {
            throw new IllegalStateException("MCP_JWT_PRIVATE_KEY n'est pas une clé privée RSA PKCS#8 valide", e);
        }
    }

    private static RSAKey clePublique(String base64, String kid) {
        try {
            var publique = (RSAPublicKey) KeyFactory.getInstance("RSA")
                    .generatePublic(new X509EncodedKeySpec(decoder(base64, "MCP_JWT_PREVIOUS_PUBLIC_KEY")));
            verifierTaille(publique, "MCP_JWT_PREVIOUS_PUBLIC_KEY");
            return new RSAKey.Builder(publique).keyID(kid).keyUse(KeyUse.SIGNATURE).algorithm(JWSAlgorithm.RS256).build();
        } catch (GeneralSecurityException | ClassCastException e) {
            throw new IllegalStateException("MCP_JWT_PREVIOUS_PUBLIC_KEY n'est pas une clé publique RSA X.509 valide", e);
        }
    }

    private static void verifierTaille(RSAPublicKey cle, String variable) {
        if (cle.getModulus().bitLength() < TAILLE_MINIMALE) {
            throw new IllegalStateException(variable + " : clé RSA de " + TAILLE_MINIMALE + " bits au moins exigée");
        }
    }

    private static byte[] decoder(String base64, String variable) {
        try {
            return Base64.getDecoder().decode(base64.replaceAll("\\s", ""));
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException(variable + " n'est pas du base64 valide", e);
        }
    }

    private static String obligatoire(String valeur, String variable) {
        if (estVide(valeur)) {
            throw new IllegalStateException(variable + " est obligatoire quand MCP_ENABLED=true");
        }
        return valeur.trim();
    }

    private static boolean estVide(String valeur) {
        return valeur == null || valeur.isBlank();
    }
}

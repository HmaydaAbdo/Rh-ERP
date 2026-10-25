package staport.rh.auth.security;

import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import org.junit.jupiter.api.Test;

import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Lecture des clés du jeton agent : MCP désactivé sans clé, démarrage refusé pour toute clé incomplète ou faible. */
class AgentSigningKeysTest {

    @Test
    void mcp_desactive_ne_lit_aucune_cle() {
        AgentSigningKeys cles = new AgentSigningKeys(false, "", "", "", "");
        assertThat(cles.courante()).isEmpty();
        assertThat(cles.publiques().getKeys()).isEmpty();
    }

    @Test
    void mcp_active_exige_la_cle_privee_et_son_identifiant() throws Exception {
        String prive = prive(cle(3072));
        assertThatThrownBy(() -> new AgentSigningKeys(true, "", "kid", "", ""))
                .hasMessageContaining("MCP_JWT_PRIVATE_KEY est obligatoire");
        assertThatThrownBy(() -> new AgentSigningKeys(true, prive, " ", "", ""))
                .hasMessageContaining("MCP_JWT_KEY_ID est obligatoire");
    }

    @Test
    void une_cle_de_moins_de_3072_bits_est_refusee() throws Exception {
        String faible = prive(cle(2048));
        assertThatThrownBy(() -> new AgentSigningKeys(true, faible, "kid", "", ""))
                .hasMessageContaining("3072 bits");
    }

    @Test
    void une_cle_illisible_est_refusee_sans_reprendre_son_contenu() {
        assertThatThrownBy(() -> new AgentSigningKeys(true, "pas-une-cle", "kid", "", ""))
                .hasMessageNotContaining("pas-une-cle");
    }

    @Test
    void la_cle_precedente_exige_un_identifiant_distinct() throws Exception {
        String prive = prive(cle(3072));
        String precedente = Base64.getEncoder().encodeToString(cle(3072).toPublicKey().getEncoded());
        assertThatThrownBy(() -> new AgentSigningKeys(true, prive, "kid", precedente, ""))
                .hasMessageContaining("MCP_JWT_PREVIOUS_KEY_ID est obligatoire");
        assertThatThrownBy(() -> new AgentSigningKeys(true, prive, "kid", precedente, "kid"))
                .hasMessageContaining("doit différer");

        AgentSigningKeys cles = new AgentSigningKeys(true, prive, "kid", precedente, "ancienne");
        assertThat(cles.publiques().getKeys()).extracting(k -> k.getKeyID()).containsExactly("kid", "ancienne");
        assertThat(cles.publiques().getKeys()).noneMatch(k -> k.isPrivate());
    }

    private static RSAKey cle(int bits) throws Exception {
        return new RSAKeyGenerator(bits, true).generate();
    }

    private static String prive(RSAKey cle) throws Exception {
        return Base64.getEncoder().encodeToString(cle.toPrivateKey().getEncoded());
    }
}

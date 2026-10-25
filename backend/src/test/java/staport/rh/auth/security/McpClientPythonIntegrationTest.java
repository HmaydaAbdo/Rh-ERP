package staport.rh.auth.security;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.beans.factory.annotation.Autowired;
import staport.rh.auth.entities.Utilisateur;
import staport.rh.auth.services.interfaces.IAgentService;
import staport.rh.support.McpIntegrationTestBase;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * T4 de bout en bout : le client MCP Python du service IA ({@code ia/tests/integration}) appelle la vraie route
 * {@code /mcp} de l'application complète avec un jeton agent émis par Spring. Exige {@code uv} : lancé avec
 * {@code -Dia.client-python=true} (étape de la CI, voir docs/ia.md), ignoré sinon.
 */
class McpClientPythonIntegrationTest extends McpIntegrationTestBase {

    @Autowired
    private IAgentService agents;

    @Test
    @Timeout(180)
    void le_client_mcp_python_appelle_la_route_mcp_avec_un_jeton_agent() throws Exception {
        assumeTrue(Boolean.getBoolean("ia.client-python"), "Lancer avec -Dia.client-python=true (uv requis)");
        Utilisateur utilisateur = creerUtilisateur(Set.of("IA_UTILISER"), true);
        String jeton = agents.emettreJeton(utilisateur.getId()).jeton();

        Path serviceIa = Path.of("..", "ia").toAbsolutePath().normalize();
        Path rapport = Path.of("target", "client-python-mcp-erp-rh.txt").toAbsolutePath();
        var processus = new ProcessBuilder(System.getProperty("uv.executable", "uv"), "run", "--locked", "pytest",
                "tests/integration", "-q", "-rA", "-p", "no:cacheprovider")
                .directory(serviceIa.toFile())
                .redirectErrorStream(true)
                .redirectOutput(rapport.toFile());
        processus.environment().put("MCP_ERP_RH_URL", "http://127.0.0.1:" + port + "/mcp");
        processus.environment().put("MCP_ERP_RH_JETON", jeton);
        processus.environment().put("MCP_ERP_RH_UTILISATEUR", utilisateur.getUsername());
        Process client = processus.start();
        try {
            assertThat(client.waitFor(150, TimeUnit.SECONDS)).as("client Python terminé ; rapport : %s", rapport).isTrue();
            String sortie = Files.readString(rapport);
            assertThat(client.exitValue()).as("Résultats Python :\n%s", sortie).isZero();
            assertThat(sortie).contains("2 passed").doesNotContain(jeton);
        } finally {
            client.destroyForcibly();
        }
    }
}

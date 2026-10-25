package staport.rh.auth.security;

import com.nimbusds.jose.jwk.RSAKey;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import staport.rh.audit.support.AuditIntegrationTestBase;
import staport.rh.auth.entities.Role;
import staport.rh.auth.entities.Utilisateur;
import staport.rh.auth.repositories.PermissionRepository;
import staport.rh.auth.repositories.RoleRepository;
import staport.rh.auth.repositories.UtilisateurRepository;
import staport.rh.auth.services.interfaces.IAgentService;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * T4 de bout en bout : le client MCP Python du service IA ({@code ia/tests/integration}) appelle la vraie route
 * {@code /mcp} de l'application complète avec un jeton agent émis par Spring. Exige {@code uv} : lancé explicitement
 * avec {@code -Dia.client-python=true} (étape dédiée de la CI, voir docs/ia.md), ignoré sinon.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class McpClientPythonIntegrationTest extends AuditIntegrationTestBase {

    private static final RSAKey CLE = McpSecuriteIntegrationTest.genererCle("cle-python");

    @DynamicPropertySource
    static void activerMcp(DynamicPropertyRegistry proprietes) {
        proprietes.add("security.mcp.enabled", () -> "true");
        proprietes.add("security.mcp.private-key", () -> McpSecuriteIntegrationTest.base64Prive(CLE));
        proprietes.add("security.mcp.key-id", CLE::getKeyID);
    }

    @LocalServerPort
    private int port;
    @Autowired
    private IAgentService agents;
    @Autowired
    private UtilisateurRepository utilisateurs;
    @Autowired
    private RoleRepository roles;
    @Autowired
    private PermissionRepository permissions;
    @Autowired
    private PasswordEncoder encodeur;

    private Long utilisateurId;
    private Long roleId;

    @AfterEach
    void supprimer() {
        if (utilisateurId != null) {
            utilisateurs.deleteById(utilisateurId);
        }
        if (roleId != null) {
            roles.deleteById(roleId);
        }
    }

    @Test
    @Timeout(180)
    void le_client_mcp_python_appelle_la_route_mcp_avec_un_jeton_agent() throws Exception {
        assumeTrue(Boolean.getBoolean("ia.client-python"), "Lancer avec -Dia.client-python=true (uv requis)");
        Utilisateur utilisateur = creerUtilisateur();
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

    private Utilisateur creerUtilisateur() {
        String suffixe = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        Role role = new Role();
        role.setNom("IA-PY-" + suffixe);
        role.setDescription("Rôle de test T4 (client Python)");
        role.setPermissions(new HashSet<>(permissions.findByCodeIn(List.of("IA_UTILISER"))));
        roleId = roles.saveAndFlush(role).getId();

        Utilisateur utilisateur = new Utilisateur();
        utilisateur.setUsername("ia-py-" + suffixe);
        utilisateur.setEmail("ia-py-" + suffixe + "@example.test");
        utilisateur.setMotDePasseHash(encodeur.encode("mot-de-passe-de-test"));
        utilisateur.setActif(true);
        utilisateur.setRoles(new HashSet<>(Set.of(role)));
        utilisateur = utilisateurs.saveAndFlush(utilisateur);
        utilisateurId = utilisateur.getId();
        return utilisateur;
    }
}

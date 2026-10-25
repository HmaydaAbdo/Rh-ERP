package staport.rh.mcp;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.beans.factory.annotation.Autowired;
import staport.rh.audit.support.DonneesDeTest;
import staport.rh.auth.security.JwtService;
import staport.rh.support.McpIntegrationTestBase;

import java.io.IOException;
import java.net.ServerSocket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.YearMonth;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * T7 (docs/ia.md) : flux réel navigateur → service IA → MCP → Spring, sans navigateur. Démarre l'application de test,
 * le service IA ({@code uvicorn}) relié à elle et à la passerelle LiteLLM, puis le client AG-UI officiel
 * ({@code scripts/ia/agui-client}, {@code @ag-ui/client}) avec un jeton de connexion ordinaire. Opt-in :
 * {@code -Dia.agui=true}, une passerelle prête, {@code IA_LITELLM_BASE_URL} / {@code IA_LITELLM_API_KEY} et
 * {@code npm ci} fait dans {@code scripts/ia/agui-client}. Journaux dans {@code target/agui-*.txt}.
 */
class FluxAgUiIntegrationTest extends McpIntegrationTestBase {

    private static final Set<String> DROITS = Set.of("IA_UTILISER", "PAIE_READ", "EMPLOYEE_READ", "CHANTIER_READ",
            "EQUIPE_READ", "FUNCTION_READ");

    @Autowired
    private JwtService jwtService;

    @Test
    @Timeout(value = 15, unit = TimeUnit.MINUTES)
    void le_client_ag_ui_officiel_obtient_une_reponse_verifiee() throws Exception {
        assumeTrue(Boolean.getBoolean("ia.agui"), "Lancer avec -Dia.agui=true (passerelle LiteLLM requise)");
        assumeTrue(System.getenv("IA_LITELLM_BASE_URL") != null && System.getenv("IA_LITELLM_API_KEY") != null,
                "IA_LITELLM_BASE_URL et IA_LITELLM_API_KEY requis");

        // Un mois isolé des autres tests et un chantier à un seul bulletin de 3 000 MAD : la réponse est connue.
        YearMonth mois = YearMonth.of(3500 + ThreadLocalRandom.current().nextInt(400), 1 + ThreadLocalRandom.current().nextInt(12));
        DonneesDeTest.Referentiel ref = donnees.creerReferentiel();
        donnees.creerBulletin(ref, mois);

        int portIa = portLibre();
        Path journalIa = Path.of("target", "agui-service.txt").toAbsolutePath();
        Path journalClient = Path.of("target", "agui-client.txt").toAbsolutePath();
        var service = new ProcessBuilder(System.getProperty("uv.executable", "uv"), "run", "--locked", "uvicorn",
                "--factory", "erp_rh_ia.app:creer_app", "--host", "127.0.0.1", "--port", String.valueOf(portIa))
                .directory(Path.of("..", "ia").toAbsolutePath().normalize().toFile())
                .redirectErrorStream(true)
                .redirectOutput(journalIa.toFile());
        service.environment().put("IA_ENABLED", "true");
        service.environment().put("IA_ERP_API_URL", "http://127.0.0.1:" + port);
        Process ia = service.start();
        try {
            attendreSante(portIa, ia, journalIa);
            String jeton = jwtService.genererAccessToken(creerUtilisateur(DROITS, true), DROITS, Set.of());
            var client = new ProcessBuilder(List.of(System.getProperty("node.executable", "node"), "--test",
                    "src/flux.test.ts"))
                    .directory(Path.of("..", "scripts", "ia", "agui-client").toAbsolutePath().normalize().toFile())
                    .redirectErrorStream(true)
                    .redirectOutput(journalClient.toFile());
            client.environment().put("AGUI_URL", "http://127.0.0.1:" + portIa + "/agui");
            client.environment().put("AGUI_JETON", jeton);
            client.environment().put("AGUI_QUESTION",
                    "Quelle est la masse salariale du chantier C-" + ref.suffixe() + " en " + mois + " ?");
            client.environment().put("AGUI_ATTENDU", "3000");
            Process node = client.start();
            assertThat(node.waitFor(12, TimeUnit.MINUTES)).as("client AG-UI terminé ; journal : %s", journalClient)
                    .isTrue();
            assertThat(node.exitValue()).as("Client :\n%s\nService :\n%s", Files.readString(journalClient),
                    Files.readString(journalIa)).isZero();
        } finally {
            ia.destroyForcibly();
        }
    }

    private static int portLibre() throws IOException {
        try (ServerSocket socket = new ServerSocket(0)) {
            return socket.getLocalPort();
        }
    }

    private static void attendreSante(int portIa, Process ia, Path journal) throws Exception {
        HttpClient http = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(2)).build();
        HttpRequest sante = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + portIa + "/health/ready")).build();
        for (int essai = 0; essai < 60; essai++) {
            assertThat(ia.isAlive()).as("service IA arrêté :\n%s", Files.readString(journal)).isTrue();
            try {
                if (http.send(sante, HttpResponse.BodyHandlers.discarding()).statusCode() == 200) {
                    return;
                }
            } catch (IOException pasEncore) {
                // le service démarre
            }
            Thread.sleep(1_000);
        }
        throw new AssertionError("service IA non prêt :\n" + Files.readString(journal));
    }
}

package staport.rh.mcp;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import staport.rh.audit.support.DonneesDeTest;
import staport.rh.auth.entities.Utilisateur;
import staport.rh.support.McpIntegrationTestBase;
import tools.jackson.databind.json.JsonMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.time.YearMonth;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * Banc de démonstration de l'assistant (docs/ia.md, T8) : l'application de test avec des données fictives, un compte de
 * test et le service IA ({@code uvicorn}) relié à elle et à la passerelle LiteLLM, laissés en marche pour vérifier le
 * parcours au navigateur ({@code ng serve} pointé sur les ports écrits dans {@code target/banc-assistant.json}). S'arrête
 * quand {@code target/banc-assistant.stop} apparaît, ou après 45 minutes. Opt-in : {@code -Dia.banc=true},
 * {@code IA_LITELLM_BASE_URL} / {@code IA_LITELLM_API_KEY}. Aucune donnée réelle.
 */
class BancAssistantTest extends McpIntegrationTestBase {

    private static final Set<String> DROITS = Set.of("IA_UTILISER", "PAIE_READ", "EMPLOYEE_READ", "CHANTIER_READ",
            "EQUIPE_READ", "FUNCTION_READ", "CARTE_READ");

    @Test
    @Timeout(value = 50, unit = TimeUnit.MINUTES)
    void le_banc_reste_ouvert_pour_le_navigateur() throws Exception {
        assumeTrue(Boolean.getBoolean("ia.banc"), "Lancer avec -Dia.banc=true (passerelle LiteLLM requise)");
        assumeTrue(System.getenv("IA_LITELLM_BASE_URL") != null && System.getenv("IA_LITELLM_API_KEY") != null,
                "IA_LITELLM_BASE_URL et IA_LITELLM_API_KEY requis");

        YearMonth septembre = YearMonth.of(2026, 9);
        DonneesDeTest.Referentiel[] refs = {donnees.creerReferentiel(), donnees.creerReferentiel(), donnees.creerReferentiel()};
        for (DonneesDeTest.Referentiel ref : refs) {
            donnees.creerBulletin(ref, septembre.minusMonths(1));
            donnees.creerBulletin(ref, septembre);
            donnees.renseignerSalaire(ref);
        }
        Utilisateur compte = creerUtilisateur(DROITS, true);

        int portIa = Integer.getInteger("ia.banc.port", 5103);
        Path journalIa = Path.of("target", "banc-assistant-ia.txt").toAbsolutePath();
        Path arret = Path.of("target", "banc-assistant.stop").toAbsolutePath();
        Files.deleteIfExists(arret);
        var service = new ProcessBuilder(System.getProperty("uv.executable", "uv"), "run", "--locked", "uvicorn",
                "--factory", "erp_rh_ia.app:creer_app", "--host", "127.0.0.1", "--port", String.valueOf(portIa))
                .directory(Path.of("..", "ia").toAbsolutePath().normalize().toFile())
                .redirectErrorStream(true)
                .redirectOutput(journalIa.toFile());
        service.environment().put("IA_ENABLED", "true");
        service.environment().put("IA_ERP_API_URL", "http://127.0.0.1:" + port);
        Process ia = service.start();
        try {
            Map<String, Object> banc = new LinkedHashMap<>();
            banc.put("backend", "http://127.0.0.1:" + port);
            banc.put("ia", "http://127.0.0.1:" + portIa);
            banc.put("utilisateur", compte.getUsername());
            banc.put("chantiers", java.util.Arrays.stream(refs).map(r -> "C-" + r.suffixe()).toList());
            banc.put("periode", septembre.toString());
            Files.writeString(Path.of("target", "banc-assistant.json"), JsonMapper.builder().build().writeValueAsString(banc));
            Instant fin = Instant.now().plus(Duration.ofMinutes(45));
            while (Instant.now().isBefore(fin) && !Files.exists(arret) && ia.isAlive()) {
                Thread.sleep(2_000);
            }
        } finally {
            ia.destroyForcibly();
            Files.deleteIfExists(arret);
        }
    }
}

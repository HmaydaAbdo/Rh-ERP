package staport.rh.mcp;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import staport.rh.audit.support.DonneesDeTest;
import staport.rh.auth.entities.Utilisateur;
import staport.rh.auth.security.JwtService;
import staport.rh.employee.services.interfaces.IEmployeeService;
import staport.rh.support.McpIntegrationTestBase;
import staport.rh.support.ParametresDeTest;
import tools.jackson.databind.json.JsonMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * T6 (docs/ia.md, § 4) : évaluation de l'agent sur le jeu de référence, avec un vrai modèle derrière LiteLLM. Crée des
 * données synthétiques, démarre l'application, puis lance {@code python -m erp_rh_ia.evaluation} ; le rapport est écrit
 * dans {@code target/evaluation-ia.json}. Opt-in : {@code -Dia.evaluation=true}, une passerelle prête et les variables
 * {@code IA_LITELLM_BASE_URL} / {@code IA_LITELLM_API_KEY}. Le test mesure ; il n'impose pas de seuil tant que le
 * propriétaire ne l'a pas fixé.
 */
class EvaluationAgentIaTest extends McpIntegrationTestBase {

    private static final Set<String> TOUT = Set.of("IA_UTILISER", "PAIE_READ", "PAIE_EXPORT", "EMPLOYEE_READ",
            "CHANTIER_READ", "EQUIPE_READ", "FUNCTION_READ", "PARAMETRE_READ", "ROLE_MANAGE", "AUDIT_READ");

    @Value("${security.jwt.secret}")
    private String secretJwt;
    @Value("${spring.application.name}")
    private String emetteur;
    @Autowired
    private IEmployeeService employes;

    @Test
    @Timeout(value = 40, unit = TimeUnit.MINUTES)
    void l_agent_est_evalue_sur_le_jeu_de_reference() throws Exception {
        assumeTrue(Boolean.getBoolean("ia.evaluation"), "Lancer avec -Dia.evaluation=true (passerelle LiteLLM requise)");
        assumeTrue(System.getenv("IA_LITELLM_BASE_URL") != null && System.getenv("IA_LITELLM_API_KEY") != null,
                "IA_LITELLM_BASE_URL et IA_LITELLM_API_KEY requis");

        // Deux mois contigus isolés des autres tests (leurs mois s'arrêtent avant 2900).
        YearMonth moisA = YearMonth.of(3000 + ThreadLocalRandom.current().nextInt(500), 1 + ThreadLocalRandom.current().nextInt(11));
        YearMonth moisB = moisA.plusMonths(1);
        DonneesDeTest.Referentiel a = donnees.creerReferentiel();
        DonneesDeTest.Referentiel b = donnees.creerReferentiel();
        DonneesDeTest.Referentiel c = donnees.creerReferentiel();
        for (DonneesDeTest.Referentiel ref : new DonneesDeTest.Referentiel[]{a, b, c}) {
            donnees.creerBulletin(ref, moisA);
            donnees.creerBulletin(ref, moisB);
        }
        donnees.renseignerSalaire(a);
        employes.enregistrerSortie(c.employeId(), moisB, "STC");

        Map<String, Object> marqueurs = new LinkedHashMap<>();
        marqueurs.put("periode_a", moisA.toString());
        marqueurs.put("periode_b", moisB.toString());
        marqueurs.put("chantier_a_id", a.chantierId());
        marqueurs.put("chantier_a_code", "C-" + a.suffixe());
        marqueurs.put("equipe_a_id", a.equipeId());
        marqueurs.put("equipe_a_code", "E" + a.suffixe());
        marqueurs.put("employe_a_id", a.employeId());
        marqueurs.put("employe_a_nom", "Nom " + a.suffixe());

        Path serviceIa = Path.of("..", "ia").toAbsolutePath().normalize();
        Path rapport = Path.of("target", "evaluation-ia.json").toAbsolutePath();
        Path journal = Path.of("target", "evaluation-ia.txt").toAbsolutePath();
        Files.deleteIfExists(rapport);
        List<String> commande = new ArrayList<>(List.of(System.getProperty("uv.executable", "uv"), "run", "--locked",
                "python", "-m", "erp_rh_ia.evaluation", "--rapport", rapport.toString()));
        // -Dia.evaluation.cas=id1,id2 rejoue seulement ces cas (diagnostic).
        String cas = System.getProperty("ia.evaluation.cas");
        if (cas != null && !cas.isBlank()) {
            commande.addAll(List.of("--cas", cas));
        }
        var processus = new ProcessBuilder(commande)
                .directory(serviceIa.toFile())
                .redirectErrorStream(true)
                .redirectOutput(journal.toFile());
        processus.environment().put("EVAL_API_URL", "http://127.0.0.1:" + port);
        processus.environment().put("EVAL_JETON_COMPLET", connexion(creerUtilisateur(TOUT, true), TOUT));
        Set<String> restreint = Set.of("IA_UTILISER", "EMPLOYEE_READ");
        processus.environment().put("EVAL_JETON_RESTREINT", connexion(creerUtilisateur(restreint, true), restreint));
        processus.environment().put("EVAL_DONNEES", JsonMapper.builder().build().writeValueAsString(marqueurs));
        Process evaluation = processus.start();
        try {
            assertThat(evaluation.waitFor(35, TimeUnit.MINUTES)).as("évaluation terminée ; journal : %s", journal).isTrue();
            assertThat(evaluation.exitValue()).as("Journal :\n%s", Files.readString(journal)).isZero();
            assertThat(rapport).exists();
        } finally {
            evaluation.destroyForcibly();
        }
    }

    /** Jeton d'une heure : l'évaluation dure plus que les 15 minutes d'un jeton ordinaire. Mêmes clé et émetteur. */
    private String connexion(Utilisateur utilisateur, Set<String> permissions) {
        JwtService pourEvaluation = new JwtService(secretJwt, emetteur,
                ParametresDeTest.avecDureeJetonAcces(Duration.ofHours(1)));
        return pourEvaluation.genererAccessToken(utilisateur, permissions, Set.of());
    }
}

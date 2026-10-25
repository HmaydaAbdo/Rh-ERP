package staport.rh.mcp;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import staport.rh.audit.support.DonneesDeTest;
import staport.rh.auth.entities.Utilisateur;
import staport.rh.auth.services.interfaces.IAgentService;
import staport.rh.employee.dtos.request.EmployeeSearchCriteria;
import staport.rh.employee.dtos.response.EmployeeAnalytiqueDto;
import staport.rh.employee.services.interfaces.IEmployeeAnalytiqueService;
import staport.rh.employee.services.interfaces.IEmployeeService;
import staport.rh.paie.dtos.request.PaieSearchCriteria;
import staport.rh.paie.dtos.response.PaieAnalytiqueDto;
import staport.rh.paie.services.interfaces.IPaieAnalytiqueService;
import staport.rh.support.McpIntegrationTestBase;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * T5 (docs/ia.md) : outils MCP de lecture sur l'application complète. Chaque chiffre rendu est comparé à la façade du
 * domaine (le modèle ne calcule rien), chaque outil refuse sans sa permission, le salaire n'apparaît qu'avec
 * {@code PAIE_READ} et la vue proposée porte les paramètres d'URL des vues partagées.
 */
class McpOutilsLectureIntegrationTest extends McpIntegrationTestBase {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Set<String> TOUT = Set.of("IA_UTILISER", "PAIE_READ", "EMPLOYEE_READ", "CHANTIER_READ");

    @Autowired
    private IAgentService agents;
    @Autowired
    private IPaieAnalytiqueService paieAnalytique;
    @Autowired
    private IEmployeeAnalytiqueService employesAnalytique;
    @Autowired
    private IEmployeeService employes;

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private DonneesDeTest.Referentiel ref;
    private YearMonth periode;

    @BeforeEach
    void creerDonnees() {
        ref = donnees.creerReferentiel();
        // Un mois isolé des autres tests de la base partagée.
        periode = YearMonth.of(2090 + ThreadLocalRandom.current().nextInt(9), 1 + ThreadLocalRandom.current().nextInt(12));
        donnees.creerBulletin(ref, periode);
    }

    @Test
    void le_catalogue_publie_l_identite_et_les_cinq_outils_de_lecture() throws Exception {
        JsonNode outils = rpc(jeton(TOUT), "tools/list", Map.of()).get("tools");
        List<String> noms = new ArrayList<>();
        outils.forEach(outil -> {
            noms.add(outil.get("name").asString());
            assertThat(outil.get("annotations").get("readOnlyHint").asBoolean()).isTrue();
        });
        assertThat(noms).containsExactlyInAnyOrder("systeme_identite", "paie_indicateurs", "employes_compter",
                "employes_rechercher", "employes_sorties", "chantier_fiche");
    }

    @Test
    void paie_indicateurs_rend_les_chiffres_du_domaine_et_la_vue_analytique() throws Exception {
        JsonNode resultat = appeler(jeton(TOUT), "paie_indicateurs",
                Map.of("periode", periode.toString(), "chantierIds", List.of(ref.chantierId())));

        PaieAnalytiqueDto attendu = paieAnalytique.analyser(
                new PaieSearchCriteria(null, null, periode, null, List.of(ref.chantierId()), null));
        JsonNode kpi = resultat.get("indicateurs");
        assertThat(kpi.get("masse").decimalValue()).isEqualByComparingTo(attendu.kpis().masse());
        assertThat(kpi.get("masse").decimalValue()).isEqualByComparingTo(new BigDecimal("3000.00"));
        assertThat(kpi.get("effectif").asLong()).isEqualTo(attendu.kpis().effectif()).isEqualTo(1);
        assertThat(resultat.get("periode").asString()).isEqualTo(periode.toString());
        assertThat(resultat.get("principauxChantiers").get(0).get("id").asLong()).isEqualTo(ref.chantierId());
        assertVue(resultat, "paie", "analytique",
                Map.of("periode", periode.toString(), "chantierIds", String.valueOf(ref.chantierId())));
    }

    @Test
    void chaque_outil_refuse_sans_sa_permission_et_le_refus_est_journalise() throws Exception {
        String sansDroitsMetier = jeton(Set.of("IA_UTILISER"));
        Map<String, Map<String, Object>> appels = Map.of(
                "paie_indicateurs", Map.of("periode", periode.toString()),
                "employes_compter", Map.of(),
                "employes_rechercher", Map.of("nom", "Nom"),
                "employes_sorties", Map.of("periode", periode.toString()),
                "chantier_fiche", Map.of("recherche", "C-"));
        long refusAvant = refusJournalises();
        for (var appel : appels.entrySet()) {
            JsonNode resultat = rpc(sansDroitsMetier, "tools/call", Map.of("name", appel.getKey(), "arguments", appel.getValue()));
            assertThat(resultat.get("isError").asBoolean()).as(appel.getKey()).isTrue();
            assertThat(resultat.get("content").get(0).get("text").asString()).startsWith("Accès refusé : permission");
            assertThat(resultat.has("structuredContent")).isFalse();
        }
        assertThat(refusJournalises() - refusAvant).isEqualTo(appels.size());
    }

    @Test
    void employes_rechercher_ne_rend_le_salaire_qu_avec_le_droit_paie_et_jamais_le_cin() throws Exception {
        Map<String, Object> arguments = Map.of("nom", "Nom " + ref.suffixe());

        JsonNode avecPaie = appeler(jeton(TOUT), "employes_rechercher", arguments);
        JsonNode fiche = avecPaie.get("employes").get(0);
        assertThat(avecPaie.get("salaireVisible").asBoolean()).isTrue();
        assertThat(fiche.get("id").asLong()).isEqualTo(ref.employeId());
        assertThat(fiche.get("statut").asString()).isEqualTo("EN_POSTE");
        assertThat(fiche.has("salaire")).isTrue();
        assertThat(fiche.has("cin")).isFalse();
        assertThat(fiche.has("dateNaissance")).isFalse();

        JsonNode sansPaie = appeler(jeton(Set.of("IA_UTILISER", "EMPLOYEE_READ")), "employes_rechercher", arguments);
        JsonNode masquee = sansPaie.get("employes").get(0);
        assertThat(sansPaie.get("salaireVisible").asBoolean()).isFalse();
        assertThat(masquee.has("salaire")).isFalse();
        assertThat(masquee.has("typeSalaire")).isFalse();
        assertVue(sansPaie, "employees", "tabulaire", Map.of("nom", "Nom " + ref.suffixe()));
    }

    @Test
    void employes_rechercher_exige_un_critere() throws Exception {
        JsonNode resultat = rpc(jeton(TOUT), "tools/call", Map.of("name", "employes_rechercher", "arguments", Map.of()));
        assertThat(resultat.get("isError").asBoolean()).isTrue();
        assertThat(resultat.get("content").get(0).get("text").asString()).contains("Préciser un nom ou un périmètre");
    }

    @Test
    void employes_compter_rend_les_chiffres_du_domaine() throws Exception {
        JsonNode resultat = appeler(jeton(TOUT), "employes_compter", Map.of("chantierIds", List.of(ref.chantierId())));

        EmployeeAnalytiqueDto attendu = employesAnalytique.analyser(
                new EmployeeSearchCriteria(null, null, null, List.of(ref.chantierId()), null, null));
        assertThat(resultat.get("effectif").asLong()).isEqualTo(attendu.effectif()).isEqualTo(1);
        assertThat(resultat.get("enPoste").asLong()).isEqualTo(attendu.actifs());
        assertThat(resultat.get("sortis").asLong()).isEqualTo(attendu.inactifs());
        assertVue(resultat, "employees", "analytique", Map.of("chantierIds", String.valueOf(ref.chantierId())));
    }

    @Test
    void employes_sorties_compte_les_departs_du_mois() throws Exception {
        employes.enregistrerSortie(ref.employeId(), periode, "STC");

        JsonNode resultat = appeler(jeton(TOUT), "employes_sorties", Map.of("periode", periode.toString()));
        assertThat(resultat.get("nombre").asLong()).isEqualTo(1);
        assertThat(resultat.get("parMotif").get("STC").asLong()).isEqualTo(1);
        assertThat(resultat.get("employes").get(0).get("id").asLong()).isEqualTo(ref.employeId());
        assertVue(resultat, "employees", "tabulaire", Map.of("statut", "INACTIF"));
    }

    @Test
    void chantier_fiche_retrouve_le_chantier_et_son_statut() throws Exception {
        JsonNode resultat = appeler(jeton(TOUT), "chantier_fiche", Map.of("recherche", "C-" + ref.suffixe()));
        JsonNode chantier = resultat.get("chantiers").get(0);
        assertThat(chantier.get("id").asLong()).isEqualTo(ref.chantierId());
        assertThat(chantier.get("statut").asString()).isIn("EN_COURS", "CLOTURE");
        assertVue(resultat, "chantiers", "tabulaire", Map.of("code", "C-" + ref.suffixe()));
    }

    @Test
    void un_argument_hors_schema_est_refuse_avant_l_outil() throws Exception {
        JsonNode resultat = rpc(jeton(TOUT), "tools/call",
                Map.of("name", "paie_indicateurs", "arguments", Map.of("periode", "mars 2026")));
        assertThat(resultat.get("isError").asBoolean()).isTrue();
        assertThat(resultat.has("structuredContent")).isFalse();
    }

    // --- outils ---

    private static void assertVue(JsonNode resultat, String module, String vue, Map<String, String> parametres) {
        JsonNode proposee = resultat.get("vue");
        assertThat(proposee.get("module").asString()).isEqualTo(module);
        assertThat(proposee.get("vue").asString()).isEqualTo(vue);
        parametres.forEach((cle, valeur) -> assertThat(proposee.get("parametres").get(cle).asString()).as(cle).isEqualTo(valeur));
    }

    private JsonNode appeler(String jeton, String outil, Map<String, Object> arguments) throws Exception {
        JsonNode resultat = rpc(jeton, "tools/call", Map.of("name", outil, "arguments", arguments));
        assertThat(resultat.get("isError").asBoolean()).as(resultat.toString()).isFalse();
        return resultat.get("structuredContent");
    }

    private JsonNode rpc(String jeton, String methode, Map<String, Object> parametres) throws Exception {
        String corps = JSON.writeValueAsString(Map.of("jsonrpc", "2.0", "id", 1, "method", methode, "params", parametres));
        HttpResponse<String> reponse = http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/mcp"))
                .header("Content-Type", "application/json")
                .header("Accept", "application/json, text/event-stream")
                .header("MCP-Protocol-Version", "2025-11-25")
                .header("Authorization", "Bearer " + jeton)
                .POST(HttpRequest.BodyPublishers.ofString(corps)).build(), HttpResponse.BodyHandlers.ofString());
        assertThat(reponse.statusCode()).as(reponse.body()).isEqualTo(200);
        String json = reponse.body().strip();
        if (!json.startsWith("{")) {
            json = json.lines().filter(l -> l.startsWith("data:")).map(l -> l.substring(5).strip()).findFirst().orElseThrow();
        }
        JsonNode reponseRpc = JSON.readTree(json);
        assertThat(reponseRpc.has("error")).as(json).isFalse();
        return reponseRpc.get("result");
    }

    private long refusJournalises() {
        return jdbc.queryForObject("""
                SELECT count(*) FROM audit_journal WHERE action = 'LECTURE_METIER' AND resultat = 'ECHEC'
                AND motif = 'PERMISSION_MANQUANTE' AND perimetre ->> 'canal' = 'MCP'""", Long.class);
    }

    private String jeton(Set<String> codes) {
        Utilisateur utilisateur = creerUtilisateur(codes, true);
        return agents.emettreJeton(utilisateur.getId()).jeton();
    }
}

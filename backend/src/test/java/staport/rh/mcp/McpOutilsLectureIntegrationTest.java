package staport.rh.mcp;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import staport.rh.audit.support.DonneesDeTest;
import staport.rh.auth.entities.Utilisateur;
import staport.rh.auth.services.interfaces.IAgentService;
import staport.rh.employee.dtos.request.EmployeeSearchCriteria;
import staport.rh.employee.dtos.response.EmployeeAnalytiqueDto;
import staport.rh.employee.entities.DimensionEmployes;
import staport.rh.employee.services.interfaces.IEmployeeAnalytiqueService;
import staport.rh.employee.services.interfaces.IEmployeeService;
import staport.rh.paie.dtos.request.PaieSearchCriteria;
import staport.rh.paie.dtos.response.PaieAnalytiqueDto;
import staport.rh.paie.effectifs.EffectifMoisDto;
import staport.rh.paie.effectifs.EffectifsCriteria;
import staport.rh.paie.services.interfaces.IPaieAnalytiqueService;
import staport.rh.paie.services.interfaces.IPaieEffectifsService;
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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Catalogue MCP de lecture (docs/ia.md, § 8) sur l'application complète. Chaque chiffre rendu est comparé à la façade
 * du domaine (le modèle ne calcule rien), chaque outil refuse sans sa permission et ce refus est journalisé, le salaire
 * n'apparaît qu'avec {@code PAIE_READ}, et la vue proposée porte les paramètres d'URL des vues partagées.
 */
class McpOutilsLectureIntegrationTest extends McpIntegrationTestBase {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Set<String> TOUT = Set.of("IA_UTILISER", "PAIE_READ", "PAIE_EXPORT", "EMPLOYEE_READ",
            "CHANTIER_READ", "EQUIPE_READ", "FUNCTION_READ", "PARAMETRE_READ", "ROLE_MANAGE", "AUDIT_READ");

    @Autowired
    private IAgentService agents;
    @Autowired
    private IPaieAnalytiqueService paieAnalytique;
    @Autowired
    private IPaieEffectifsService effectifs;
    @Autowired
    private IEmployeeAnalytiqueService employesAnalytique;
    @Autowired
    private IEmployeeService employes;

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private DonneesDeTest.Referentiel ref;
    private YearMonth periode;
    private String toutVoir;

    @BeforeEach
    void creerDonnees() {
        ref = donnees.creerReferentiel();
        // Un mois isolé des autres tests de la base partagée : leurs mois fixes s'arrêtent avant 2100.
        periode = YearMonth.of(2300 + ThreadLocalRandom.current().nextInt(600), 1 + ThreadLocalRandom.current().nextInt(12));
        donnees.creerBulletin(ref, periode);
        toutVoir = jeton(TOUT);
    }

    // --- catalogue et refus ---

    @Test
    void le_catalogue_publie_vingt_cinq_outils_en_lecture_seule() throws Exception {
        List<String> noms = new ArrayList<>();
        rpc(toutVoir, "tools/list", Map.of()).get("tools").forEach(outil -> {
            noms.add(outil.get("name").asString());
            assertThat(outil.get("annotations").get("readOnlyHint").asBoolean()).as(outil.get("name").asString()).isTrue();
        });
        assertThat(noms).containsExactlyInAnyOrderElementsOf(appelsTypes().keySet().stream()
                .collect(java.util.stream.Collectors.toCollection(() -> new ArrayList<>(List.of("systeme_identite")))));
        assertThat(noms).hasSize(25);
    }

    @Test
    void chaque_outil_refuse_sans_la_permission_de_son_domaine_et_le_refus_est_journalise() throws Exception {
        String sansDroitsMetier = jeton(Set.of("IA_UTILISER"));
        long refusAvant = refusJournalises();
        for (var appel : appelsTypes().entrySet()) {
            JsonNode resultat = rpc(sansDroitsMetier, "tools/call", Map.of("name", appel.getKey(), "arguments", appel.getValue()));
            assertThat(resultat.get("isError").asBoolean()).as(appel.getKey()).isTrue();
            assertThat(resultat.get("content").get(0).get("text").asString()).as(appel.getKey()).startsWith("Accès refusé : permission");
            assertThat(resultat.has("structuredContent")).isFalse();
        }
        assertThat(refusJournalises() - refusAvant).isEqualTo(appelsTypes().size());
    }

    @Test
    void chaque_outil_repond_avec_tous_les_droits() throws Exception {
        for (var appel : appelsTypes().entrySet()) {
            JsonNode resultat = rpc(toutVoir, "tools/call", Map.of("name", appel.getKey(), "arguments", appel.getValue()));
            assertThat(resultat.get("isError").asBoolean()).as(appel.getKey() + " : " + resultat).isFalse();
        }
    }

    @Test
    void un_identifiant_inconnu_est_signale_introuvable() throws Exception {
        JsonNode resultat = rpc(toutVoir, "tools/call", Map.of("name", "employe_fiche", "arguments", Map.of("id", Long.MAX_VALUE / 2)));
        assertThat(resultat.get("isError").asBoolean()).isTrue();
        assertThat(resultat.get("content").get(0).get("text").asString()).startsWith("Élément introuvable");
    }

    @Test
    void un_argument_hors_schema_est_refuse_avant_l_outil() throws Exception {
        JsonNode resultat = rpc(toutVoir, "tools/call",
                Map.of("name", "paie_indicateurs", "arguments", Map.of("periode", "mars 2026")));
        assertThat(resultat.get("isError").asBoolean()).isTrue();
        assertThat(resultat.has("structuredContent")).isFalse();
    }

    // --- Paie : chiffres du domaine ---

    @Test
    void paie_indicateurs_rend_les_chiffres_du_domaine_et_la_vue_analytique() throws Exception {
        JsonNode resultat = appeler("paie_indicateurs", Map.of("periode", periode.toString(), "chantierIds", List.of(ref.chantierId())));

        PaieAnalytiqueDto attendu = paieAnalytique.analyser(perimetreChantier());
        JsonNode kpi = resultat.get("indicateurs");
        assertThat(kpi.get("masse").decimalValue()).isEqualByComparingTo(attendu.kpis().masse()).isEqualByComparingTo("3000.00");
        assertThat(kpi.get("effectif").asLong()).isEqualTo(attendu.kpis().effectif()).isEqualTo(1);
        assertThat(resultat.get("principauxChantiers").get(0).get("id").asLong()).isEqualTo(ref.chantierId());
        assertVue(resultat, "paie", "analytique",
                Map.of("periode", periode.toString(), "chantierIds", String.valueOf(ref.chantierId())));
    }

    @Test
    void paie_repartition_et_qualite_reprennent_l_analyse_du_mois() throws Exception {
        PaieAnalytiqueDto attendu = paieAnalytique.analyser(perimetreChantier());
        JsonNode repartition = appeler("paie_repartition", Map.of("periode", periode.toString(), "dimension", "EQUIPE",
                "chantierIds", List.of(ref.chantierId())));
        assertThat(repartition.get("nombreGroupes").asInt()).isEqualTo(attendu.parEquipe().size());
        assertThat(repartition.get("groupes").get(0).get("id").asLong()).isEqualTo(ref.equipeId());
        assertThat(repartition.get("groupes").get(0).get("masse").decimalValue()).isEqualByComparingTo("3000.00");

        JsonNode qualite = appeler("paie_qualite", Map.of("periode", periode.toString(), "chantierIds", List.of(ref.chantierId())));
        assertThat(qualite.get("sansEquipe").asLong()).isEqualTo(attendu.qualite().sansEquipe());
        assertThat(qualite.get("sansObservation").asLong()).isEqualTo(attendu.qualite().sansObservation());
    }

    @Test
    void paie_periodes_evolution_et_mouvements_couvrent_le_mois() throws Exception {
        Map<String, Object> perimetre = Map.of("chantierIds", List.of(ref.chantierId()));
        JsonNode periodes = appeler("paie_periodes", perimetre);
        assertThat(periodes.get("periodes").get(0).get("periode").asString()).isEqualTo(periode.toString());
        assertThat(periodes.get("periodes").get(0).get("masse").decimalValue()).isEqualByComparingTo("3000.00");

        JsonNode evolution = appeler("paie_evolution", Map.of("periode", periode.toString(), "chantierIds", List.of(ref.chantierId())));
        JsonNode dernier = evolution.get("mois").get(evolution.get("mois").size() - 1);
        assertThat(dernier.get("periode").asString()).isEqualTo(periode.toString());

        JsonNode mouvements = appeler("paie_mouvements", Map.of("periode", periode.toString(), "chantierIds", List.of(ref.chantierId())));
        EffectifMoisDto attendu = effectifs.tendances(new EffectifsCriteria(List.of(ref.chantierId()), null, null)).stream()
                .filter(m -> m.periode().equals(periode)).findFirst().orElseThrow();
        assertThat(mouvements.get("mois").get(0).get("effectif").asLong()).isEqualTo(attendu.effectif());
        assertThat(mouvements.get("mois").get(0).get("sorties").asLong()).isEqualTo(attendu.sorties());
        assertVue(mouvements, "employees", "analytique", Map.of("periode", periode.toString()));
    }

    @Test
    void paie_mouvements_rend_l_ecart_net_les_plus_payes_et_leurs_definitions() throws Exception {
        // A payé les deux mois, B seulement le mois d'avant, C et D seulement ce mois-ci.
        YearMonth avant = periode.minusMonths(1);
        donnees.creerBulletin(ref, avant);
        DonneesDeTest.Referentiel parti = donnees.creerReferentiel();
        donnees.creerBulletin(parti, avant);
        DonneesDeTest.Referentiel arrive = donnees.creerReferentiel();
        donnees.creerBulletin(arrive, periode);
        DonneesDeTest.Referentiel arriveAussi = donnees.creerReferentiel();
        donnees.creerBulletin(arriveAussi, periode);

        JsonNode mouvements = appeler("paie_mouvements", Map.of("periode", periode.toString(), "chantierIds",
                List.of(ref.chantierId(), parti.chantierId(), arrive.chantierId(), arriveAussi.chantierId())));

        JsonNode mois = mouvements.get("mois").get(0);
        assertThat(mois.get("effectif").asLong()).isEqualTo(3);
        assertThat(mois.get("effectifMoisPrecedent").asLong()).isEqualTo(2);
        assertThat(mois.get("variation").asLong()).isEqualTo(1);
        assertThat(mois.get("entrees").asLong()).isEqualTo(2);
        assertThat(mois.get("plusPayes").asLong()).isEqualTo(1);
        assertThat(mouvements.get("definitions").get("entrees").asString()).contains("absents de la paie du mois précédent");
        assertThat(mouvements.get("definitions").get("variation").asString()).contains("écart net");
    }

    @Test
    void paie_bulletins_rechercher_rend_le_bulletin_complet_cin_compris() throws Exception {
        JsonNode resultat = appeler("paie_bulletins_rechercher", Map.of("periode", periode.toString(), "nom", "Nom " + ref.suffixe()));
        JsonNode bulletin = resultat.get("bulletins").get(0);
        assertThat(resultat.get("total").asLong()).isEqualTo(1);
        assertThat(bulletin.get("employe").get("cin").asString()).isEqualTo("CIN" + ref.suffixe());
        assertThat(bulletin.get("salaireTotal").decimalValue()).isEqualByComparingTo("3000.00");
        assertVue(resultat, "paie", "tabulaire", Map.of("periode", periode.toString(), "nom", "Nom " + ref.suffixe()));
    }

    @Test
    void rapport_preparer_ouvre_l_assistant_d_export_regle() throws Exception {
        JsonNode resultat = appeler("rapport_preparer", Map.of("periode", periode.toString(), "chantierIds", List.of(ref.chantierId())));
        assertThat(resultat.get("nombreChantiers").asInt()).isEqualTo(1);
        assertThat(resultat.get("chantiers").get(0).get("id").asLong()).isEqualTo(ref.chantierId());
        assertVue(resultat, "paie", "tabulaire", Map.of("periode", periode.toString(), "action", "export",
                "chantierIds", String.valueOf(ref.chantierId())));
    }

    // --- Employé ---

    @Test
    void employes_rechercher_rend_la_fiche_complete_et_le_salaire_seulement_avec_le_droit_paie() throws Exception {
        Map<String, Object> arguments = Map.of("cin", "CIN" + ref.suffixe());

        JsonNode avecPaie = appeler("employes_rechercher", arguments);
        JsonNode fiche = avecPaie.get("employes").get(0);
        assertThat(fiche.get("id").asLong()).isEqualTo(ref.employeId());
        assertThat(fiche.get("cin").asString()).isEqualTo("CIN" + ref.suffixe());
        assertThat(fiche.get("dateNaissance").asString()).isEqualTo("1990-01-01");
        assertThat(fiche.get("statut").asString()).isEqualTo("EN_POSTE");
        assertThat(fiche.has("salaire")).isTrue();

        JsonNode sansPaie = rpcOk(jeton(Set.of("IA_UTILISER", "EMPLOYEE_READ")), "employes_rechercher", arguments);
        assertThat(sansPaie.get("salaireVisible").asBoolean()).isFalse();
        assertThat(sansPaie.get("employes").get(0).has("salaire")).isFalse();
        assertVue(sansPaie, "employees", "tabulaire", Map.of("cin", "CIN" + ref.suffixe()));
    }

    @Test
    void employes_compter_et_regrouper_rendent_les_chiffres_du_domaine() throws Exception {
        JsonNode compter = appeler("employes_compter", Map.of("chantierIds", List.of(ref.chantierId())));
        EmployeeAnalytiqueDto attendu = employesAnalytique.analyser(
                new EmployeeSearchCriteria(null, null, null, List.of(ref.chantierId()), null, null));
        assertThat(compter.get("effectif").asLong()).isEqualTo(attendu.effectif()).isEqualTo(1);
        assertThat(compter.get("enPoste").asLong()).isEqualTo(attendu.actifs());

        JsonNode regrouper = appeler("employes_regrouper", Map.of("dimension", "FONCTION", "chantierIds", List.of(ref.chantierId())));
        var groupes = employesAnalytique.regrouper(
                new EmployeeSearchCriteria(null, null, null, List.of(ref.chantierId()), null, null), DimensionEmployes.FONCTION);
        assertThat(regrouper.get("nombreGroupes").asInt()).isEqualTo(groupes.size());
        assertThat(regrouper.get("groupes").get(0).get("id").asLong()).isEqualTo(ref.fonctionId());
        assertThat(regrouper.get("groupes").get(0).get("effectif").asLong()).isEqualTo(groupes.getFirst().effectif());
    }

    @Test
    void employe_fiche_parcours_et_sorties_suivent_un_depart() throws Exception {
        employes.enregistrerSortie(ref.employeId(), periode, "STC");

        JsonNode fiche = appeler("employe_fiche", Map.of("id", ref.employeId()));
        assertThat(fiche.get("employe").get("statut").asString()).isEqualTo("SORTI");
        assertThat(fiche.get("departs").get(0).get("periode").asString()).isEqualTo(periode.toString());
        assertVue(fiche, "employees", "fiche", Map.of("id", String.valueOf(ref.employeId())));

        JsonNode parcours = appeler("employe_parcours", Map.of("id", ref.employeId()));
        assertThat(parcours.get("indicateurs").get("moisPayes").asInt()).isEqualTo(1);
        assertThat(parcours.get("mois").get(0).get("salaireTotal").decimalValue()).isEqualByComparingTo("3000.00");

        JsonNode sorties = appeler("employes_sorties", Map.of("periode", periode.toString()));
        assertThat(sorties.get("nombre").asLong()).isEqualTo(1);
        assertThat(sorties.get("parMotif").get("STC").asLong()).isEqualTo(1);
        assertVue(sorties, "employees", "analytique", Map.of("periode", periode.toString()));
    }

    // --- référentiels et administration ---

    @Test
    void les_referentiels_se_recherchent_et_se_lisent_par_identifiant() throws Exception {
        JsonNode chantiers = appeler("chantier_rechercher", Map.of("recherche", "C-" + ref.suffixe()));
        assertThat(chantiers.get("chantiers").get(0).get("id").asLong()).isEqualTo(ref.chantierId());
        assertVue(chantiers, "chantiers", "tabulaire", Map.of("code", "C-" + ref.suffixe()));
        assertThat(appeler("chantier_fiche", Map.of("id", ref.chantierId())).get("chantier").get("statut").asString())
                .isIn("EN_COURS", "CLOTURE");
        assertThat(appeler("equipe_fiche", Map.of("id", ref.equipeId())).get("equipe").get("code").asString())
                .isEqualTo("E" + ref.suffixe());
        assertThat(appeler("fonction_rechercher", Map.of("recherche", "F-" + ref.suffixe())).get("fonctions").get(0)
                .get("id").asLong()).isEqualTo(ref.fonctionId());
        assertVue(appeler("fonction_fiche", Map.of("id", ref.fonctionId())), "functions", "fiche",
                Map.of("id", String.valueOf(ref.fonctionId())));
    }

    @Test
    void l_administration_lit_parametres_roles_journal_et_historique() throws Exception {
        assertThat(appeler("parametres_lire", Map.of()).get("parametres").size()).isPositive();

        List<String> roles = new ArrayList<>();
        appeler("roles_lister", Map.of("nom", "SYSTEM_ADMIN")).get("roles").forEach(r -> roles.add(r.get("nom").asString()));
        assertThat(roles).contains("SYSTEM_ADMIN");

        JsonNode journal = appeler("audit_rechercher", Map.of("action", "LECTURE_METIER", "limite", 5));
        assertThat(journal.get("entrees").size()).isPositive();
        assertThat(journal.get("entrees").get(0).get("action").asString()).isEqualTo("LECTURE_METIER");

        JsonNode historique = appeler("audit_historique", Map.of("entite", "Employee", "id", ref.employeId()));
        assertThat(historique.get("total").asLong()).isPositive();
        assertThat(historique.get("versions").get(0).get("operation").asString()).isNotBlank();
    }

    // --- outils de test ---

    /** Un appel valide de chaque outil métier, avec les données du test. */
    private Map<String, Map<String, Object>> appelsTypes() {
        Map<String, Map<String, Object>> appels = new LinkedHashMap<>();
        appels.put("chantier_rechercher", Map.of("recherche", "C-" + ref.suffixe()));
        appels.put("chantier_fiche", Map.of("id", ref.chantierId()));
        appels.put("equipe_rechercher", Map.of("recherche", "E" + ref.suffixe()));
        appels.put("equipe_fiche", Map.of("id", ref.equipeId()));
        appels.put("fonction_rechercher", Map.of("recherche", "F-" + ref.suffixe()));
        appels.put("fonction_fiche", Map.of("id", ref.fonctionId()));
        appels.put("employes_rechercher", Map.of("nom", "Nom " + ref.suffixe()));
        appels.put("employes_compter", Map.of());
        appels.put("employes_sorties", Map.of("periode", periode.toString()));
        appels.put("employe_fiche", Map.of("id", ref.employeId()));
        appels.put("employes_regrouper", Map.of("dimension", "CHANTIER"));
        appels.put("employe_parcours", Map.of("id", ref.employeId()));
        appels.put("paie_indicateurs", Map.of("periode", periode.toString()));
        appels.put("paie_periodes", Map.of());
        appels.put("paie_repartition", Map.of("periode", periode.toString(), "dimension", "CHANTIER"));
        appels.put("paie_evolution", Map.of("periode", periode.toString()));
        appels.put("paie_mouvements", Map.of("periode", periode.toString()));
        appels.put("paie_qualite", Map.of("periode", periode.toString()));
        appels.put("paie_bulletins_rechercher", Map.of("periode", periode.toString()));
        appels.put("rapport_preparer", Map.of("periode", periode.toString()));
        appels.put("parametres_lire", Map.of());
        appels.put("roles_lister", Map.of());
        appels.put("audit_rechercher", Map.of("limite", 1));
        appels.put("audit_historique", Map.of("entite", "Employee", "id", ref.employeId()));
        return appels;
    }

    private PaieSearchCriteria perimetreChantier() {
        return new PaieSearchCriteria(null, null, periode, null, List.of(ref.chantierId()), null);
    }

    private static void assertVue(JsonNode resultat, String module, String vue, Map<String, String> parametres) {
        JsonNode proposee = resultat.get("vue");
        assertThat(proposee.get("module").asString()).isEqualTo(module);
        assertThat(proposee.get("vue").asString()).isEqualTo(vue);
        parametres.forEach((cle, valeur) -> assertThat(proposee.get("parametres").get(cle).asString()).as(cle).isEqualTo(valeur));
    }

    private JsonNode appeler(String outil, Map<String, Object> arguments) throws Exception {
        return rpcOk(toutVoir, outil, arguments);
    }

    private JsonNode rpcOk(String jeton, String outil, Map<String, Object> arguments) throws Exception {
        JsonNode resultat = rpc(jeton, "tools/call", Map.of("name", outil, "arguments", arguments));
        assertThat(resultat.get("isError").asBoolean()).as(outil + " : " + resultat).isFalse();
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

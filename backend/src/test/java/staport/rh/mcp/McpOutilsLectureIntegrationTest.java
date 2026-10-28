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
import staport.rh.paie.dtos.response.PaieRepartitionDto;
import staport.rh.paie.effectifs.EffectifMoisDto;
import staport.rh.paie.effectifs.EffectifsCriteria;
import staport.rh.paie.services.interfaces.IPaieAnalytiqueService;
import staport.rh.paie.services.interfaces.IPaieEffectifsService;
import staport.rh.paie.services.interfaces.IPaieParcoursService;
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
    private static final Set<String> TOUT = Set.of("IA_UTILISER", "HEURES_SUP_READ", "HEURES_SUP_IMPORT", "PAIE_READ", "PAIE_EXPORT", "EMPLOYEE_READ",
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
    @Autowired
    private IPaieParcoursService parcoursEmploye;

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
    void le_catalogue_publie_trente_outils_en_lecture_seule() throws Exception {
        List<String> noms = new ArrayList<>();
        rpc(toutVoir, "tools/list", Map.of()).get("tools").forEach(outil -> {
            noms.add(outil.get("name").asString());
            assertThat(outil.get("annotations").get("readOnlyHint").asBoolean()).as(outil.get("name").asString()).isTrue();
        });
        assertThat(noms).containsExactlyInAnyOrderElementsOf(appelsTypes().keySet().stream()
                .collect(java.util.stream.Collectors.toCollection(() -> new ArrayList<>(List.of("systeme_identite")))));
        assertThat(noms).hasSize(30);
    }

    @Test
    void les_schemas_generes_par_spring_ai_portent_les_bornes_les_enumerations_et_les_descriptions() throws Exception {
        JsonNode outils = rpc(toutVoir, "tools/list", Map.of()).get("tools");
        JsonNode chantier = null;
        JsonNode mouvements = null;
        for (JsonNode outil : outils) {
            assertThat(outil.get("description").asString()).as(outil.get("name").asString()).hasSizeGreaterThan(60);
            assertThat(outil.get("outputSchema").get("type").asString()).as(outil.get("name").asString()).isEqualTo("object");
            switch (outil.get("name").asString()) {
                case "chantier_rechercher" -> chantier = outil.get("inputSchema").get("properties");
                case "paie_mouvements" -> mouvements = outil.get("inputSchema").get("properties");
                default -> { }
            }
        }
        // Spring AI génère types, énumérations et descriptions ; les bornes sont dites dans la description et appliquées
        // à l'appel par Bean Validation (le générateur de schéma ne les reprend pas).
        assertThat(chantier).isNotNull();
        assertThat(chantier.get("statut").get("enum")).hasSize(2);
        assertThat(chantier.get("limite").get("description").asString()).contains("de 1 à 20");
        assertThat(chantier.get("recherche").get("description").asString()).contains("C-1042");
        assertThat(mouvements.get("periode").get("description").asString()).contains("aaaa-MM");
        assertThat(mouvements.get("chantierIds").get("description").asString()).contains("chantier_rechercher");

        JsonNode depasse = rpc(toutVoir, "tools/call",
                Map.of("name", "chantier_rechercher", "arguments", Map.of("limite", 21)));
        assertThat(depasse.get("isError").asBoolean()).isTrue();
        assertThat(depasse.has("structuredContent")).isFalse();
    }

    @Test
    void chaque_outil_refuse_sans_la_permission_de_son_domaine_et_le_refus_est_journalise() throws Exception {
        String sansDroitsMetier = jeton(Set.of("IA_UTILISER"));
        long refusAvant = refusJournalises();
        for (var appel : appelsTypes().entrySet()) {
            JsonNode resultat = rpc(sansDroitsMetier, "tools/call", Map.of("name", appel.getKey(), "arguments", appel.getValue()));
            assertThat(resultat.get("isError").asBoolean()).as(appel.getKey()).isTrue();
            // Refus de Spring Security (@PreAuthorize) : son message, relayé tel quel par Spring AI.
            assertThat(resultat.get("content").get(0).get("text").asString()).as(appel.getKey()).contains("Access Denied");
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
        // Message de l'exception du domaine, le même que celui de l'API REST, relayé par Spring AI.
        assertThat(resultat.get("content").get(0).get("text").asString()).contains("introuvable");
    }

    @Test
    void heures_supp_import_prerequis_reutilise_le_controle_metier_et_propose_l_import() throws Exception {
        JsonNode resultat = appeler("heures_supp_import_prerequis",
                Map.of("periode", periode.toString(), "chantierId", ref.chantierId()));

        assertThat(resultat.get("resultats").get("prerequis").get("periode").asString()).isEqualTo(periode.toString());
        assertThat(resultat.get("resultats").get("prerequis").get("bulletinsDisponibles").asInt()).isEqualTo(1);
        assertThat(resultat.get("resultats").get("prerequis").get("pret").asBoolean()).isTrue();
        assertThat(resultat.get("vue").get("route").asString()).isEqualTo("/heures-supp/import");
    }

    @Test
    void un_argument_hors_schema_est_refuse_avant_l_outil() throws Exception {
        JsonNode resultat = rpc(toutVoir, "tools/call",
                Map.of("name", "paie_indicateurs", "arguments", Map.of("periode", "mars 2026")));
        assertThat(resultat.get("isError").asBoolean()).isTrue();
        assertThat(resultat.has("structuredContent")).isFalse();
    }

    // --- Tri et pagination : l'agent compose lui-même son classement ---

    @Test
    void les_bulletins_se_trient_par_salaire_dans_les_deux_sens_et_se_paginent() throws Exception {
        var a = donnees.creerReferentiel();
        var b = donnees.creerReferentiel();
        var c = donnees.creerReferentiel();
        donnees.creerBulletin(a, periode, new BigDecimal("1000.00"));
        donnees.creerBulletin(b, periode, new BigDecimal("5000.00"));
        donnees.creerBulletin(c, periode, new BigDecimal("3000.00"));
        Map<String, Object> base = Map.of("periode", periode.toString(),
                "chantierIds", List.of(a.chantierId(), b.chantierId(), c.chantierId()), "tri", "SALAIRE_TOTAL");

        assertThat(salaires(appeler("paie_bulletins_rechercher", base))).containsExactly("5000.00", "3000.00", "1000.00");
        assertThat(salaires(appeler("paie_bulletins_rechercher", avec(base, "sens", "ASC"))))
                .containsExactly("1000.00", "3000.00", "5000.00");
        JsonNode deuxieme = appeler("paie_bulletins_rechercher", avec(avec(base, "limite", 1), "page", 1));
        assertThat(salaires(deuxieme)).containsExactly("3000.00");
        assertThat(deuxieme.get("page").asInt()).isEqualTo(1);
        assertThat(deuxieme.get("total").asLong()).isEqualTo(3);
    }

    @Test
    void les_employes_se_trient_par_date_d_embauche_et_le_tri_par_salaire_exige_le_droit_de_paie() throws Exception {
        var a = donnees.creerReferentiel();
        var b = donnees.creerReferentiel();
        var c = donnees.creerReferentiel();
        donnees.fixerEmbauche(a, java.time.LocalDate.of(2021, 5, 1));
        donnees.fixerEmbauche(b, java.time.LocalDate.of(2023, 5, 1));
        donnees.fixerEmbauche(c, java.time.LocalDate.of(2022, 5, 1));
        Map<String, Object> base = Map.of("chantierIds", List.of(a.chantierId(), b.chantierId(), c.chantierId()),
                "tri", "DATE_EMBAUCHE");

        JsonNode recents = appeler("employes_rechercher", base);
        assertThat(identifiants(recents, "employes")).containsExactly(b.employeId(), c.employeId(), a.employeId());
        JsonNode anciens = appeler("employes_rechercher", avec(base, "sens", "ASC"));
        assertThat(identifiants(anciens, "employes")).containsExactly(a.employeId(), c.employeId(), b.employeId());

        String sansPaie = jeton(Set.of("IA_UTILISER", "EMPLOYEE_READ"));
        JsonNode refuse = rpc(sansPaie, "tools/call", Map.of("name", "employes_rechercher",
                "arguments", avec(base, "tri", "SALAIRE")));
        assertThat(refuse.get("isError").asBoolean()).isTrue();
        assertThat(refuse.get("content").get(0).get("text").asString()).contains("salaire");
        assertThat(rpc(sansPaie, "tools/call", Map.of("name", "employes_rechercher", "arguments", base))
                .get("isError").asBoolean()).isFalse();
    }

    @Test
    void les_groupes_se_trient_par_le_critere_demande() throws Exception {
        var a = donnees.creerReferentiel();
        var b = donnees.creerReferentiel();
        var c = donnees.creerReferentiel();
        donnees.creerBulletin(a, periode, new BigDecimal("1000.00"));
        donnees.creerBulletin(b, periode, new BigDecimal("5000.00"));
        donnees.creerBulletin(c, periode, new BigDecimal("3000.00"));
        List<Long> chantiers = List.of(a.chantierId(), b.chantierId(), c.chantierId());

        JsonNode defaut = appeler("paie_repartition", Map.of("periode", periode.toString(), "dimension", "CHANTIER",
                "chantierIds", chantiers));
        assertThat(identifiants(defaut, "groupes")).containsExactly(b.chantierId(), c.chantierId(), a.chantierId());
        var apiDefaut = paieAnalytique.repartir(new PaieSearchCriteria(null, null, periode, null, chantiers, null),
                PaieRepartitionDto.Dimension.CHANTIER, null, null);
        assertThat(apiDefaut.nombreGroupes()).isEqualTo(3);
        assertThat(apiDefaut.groupes()).extracting(PaieRepartitionDto.Groupe::id)
                .containsExactly(b.chantierId(), c.chantierId(), a.chantierId());
        JsonNode croissante = appeler("paie_repartition", Map.of("periode", periode.toString(), "dimension", "CHANTIER",
                "chantierIds", chantiers, "sens", "ASC"));
        assertThat(identifiants(croissante, "groupes")).containsExactly(a.chantierId(), c.chantierId(), b.chantierId());
        var apiCroissante = paieAnalytique.repartir(new PaieSearchCriteria(null, null, periode, null, chantiers, null),
                PaieRepartitionDto.Dimension.CHANTIER, PaieRepartitionDto.Tri.MASSE, true);
        assertThat(apiCroissante.groupes()).extracting(PaieRepartitionDto.Groupe::id)
                .containsExactly(a.chantierId(), c.chantierId(), b.chantierId());

        JsonNode parCode = appeler("employes_regrouper", Map.of("dimension", "CHANTIER", "chantierIds", chantiers,
                "tri", "CODE", "sens", "ASC"));
        List<String> codes = new ArrayList<>();
        parCode.get("groupes").forEach(g -> codes.add(g.get("code").asString()));
        assertThat(codes).isSortedAccordingTo(String.CASE_INSENSITIVE_ORDER).hasSize(3);
        var apiParCode = employesAnalytique.regrouper(
                new EmployeeSearchCriteria(null, null, null, chantiers, null, null), DimensionEmployes.CHANTIER,
                IEmployeeAnalytiqueService.TriRegroupement.CODE, true);
        assertThat(apiParCode.nombreGroupes()).isEqualTo(3);
        assertThat(apiParCode.groupes()).extracting(g -> g.code().toLowerCase())
                .isSortedAccordingTo(String.CASE_INSENSITIVE_ORDER);
    }

    @Test
    void les_referentiels_se_trient_et_se_paginent() throws Exception {
        donnees.creerReferentiel();
        donnees.creerReferentiel();
        JsonNode croissant = appeler("chantier_rechercher", Map.of("limite", 20, "tri", "CODE", "sens", "ASC"));
        JsonNode decroissant = appeler("chantier_rechercher", Map.of("limite", 20, "tri", "CODE", "sens", "DESC"));
        List<String> asc = new ArrayList<>();
        croissant.get("chantiers").forEach(ch -> asc.add(ch.get("code").asString()));
        List<String> desc = new ArrayList<>();
        decroissant.get("chantiers").forEach(ch -> desc.add(ch.get("code").asString()));
        // L'ordre est celui de la collation de PostgreSQL (la ponctuation des codes y est ignorée) et chaque réponse est une
        // fenêtre de 20 résultats : on vérifie que le sens agit (les deux extrémités diffèrent), sans supposer
        // l'ordre de comparaison de Java.
        assertThat(asc).hasSizeGreaterThan(1);
        assertThat(desc).hasSizeGreaterThan(1);
        assertThat(desc.get(0)).isNotEqualTo(asc.get(0));
        assertThat(appeler("equipe_rechercher", Map.of("limite", 1, "page", 1)).get("page").asInt()).isEqualTo(1);
    }

    private static List<String> salaires(JsonNode resultat) {
        List<String> valeurs = new ArrayList<>();
        resultat.get("bulletins").forEach(b -> valeurs.add(b.get("salaireTotal").decimalValue().setScale(2).toPlainString()));
        return valeurs;
    }

    private static List<Long> identifiants(JsonNode resultat, String liste) {
        List<Long> ids = new ArrayList<>();
        resultat.get(liste).forEach(e -> ids.add(e.get("id").asLong()));
        return ids;
    }

    private static Map<String, Object> avec(Map<String, Object> base, String cle, Object valeur) {
        Map<String, Object> copie = new LinkedHashMap<>(base);
        copie.put(cle, valeur);
        return copie;
    }

    // --- Paie : chiffres du domaine ---

    @Test
    void paie_indicateurs_rend_les_chiffres_du_domaine_et_la_vue_analytique() throws Exception {
        JsonNode resultat = appeler("paie_indicateurs", Map.of("periode", periode.toString(), "chantierIds", List.of(ref.chantierId())));

        PaieAnalytiqueDto attendu = paieAnalytique.analyser(perimetreChantier());
        JsonNode kpi = resultat.get("indicateurs");
        assertThat(kpi.get("masse").decimalValue()).isEqualByComparingTo(attendu.kpis().masse()).isEqualByComparingTo("3000.00");
        assertThat(kpi.get("effectif").asLong()).isEqualTo(attendu.kpis().effectif()).isEqualTo(1);
        assertThat(resultat.get("chantiers").get(0).get("id").asLong()).isEqualTo(ref.chantierId());
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
    void paie_comparer_rend_variations_pourcentages_et_extremes_sans_que_le_modele_calcule() throws Exception {
        YearMonth avant = periode.minusMonths(1);
        // A (setUp : 3 000 ce mois) valait 1 500 : +1 500, +100,0 %. B passe de 6 000 à 3 000 : −3 000, −50,0 %.
        donnees.creerBulletin(ref, avant, new BigDecimal("1500.00"));
        DonneesDeTest.Referentiel b = donnees.creerReferentiel();
        donnees.creerBulletin(b, avant, new BigDecimal("6000.00"));
        donnees.creerBulletin(b, periode);
        // C n'est payé que ce mois-ci (nouveau) ; D seulement le mois d'avant (disparu).
        DonneesDeTest.Referentiel nouveau = donnees.creerReferentiel();
        donnees.creerBulletin(nouveau, periode);
        DonneesDeTest.Referentiel disparu = donnees.creerReferentiel();
        donnees.creerBulletin(disparu, avant);
        List<Long> perimetre = List.of(ref.chantierId(), b.chantierId(), nouveau.chantierId(), disparu.chantierId());
        Map<String, Object> base = Map.of("dimension", "CHANTIER", "periode", periode.toString(),
                "periodeReference", avant.toString(), "chantierIds", perimetre);

        JsonNode resultat = appeler("paie_comparer", avec(base, "tri", "VARIATION_MASSE"));

        assertThat(resultat.get("periodeReference").asString()).isEqualTo(avant.toString());
        assertThat(resultat.get("nombreGroupes").asInt()).isEqualTo(4);
        JsonNode groupes = resultat.get("groupes");
        JsonNode a = groupes.get(0);
        assertThat(a.get("id").asLong()).isEqualTo(ref.chantierId());
        assertThat(a.get("statut").asString()).isEqualTo("COMPARABLE");
        assertThat(a.get("masse").decimalValue()).isEqualByComparingTo("3000.00");
        assertThat(a.get("masseReference").decimalValue()).isEqualByComparingTo("1500.00");
        assertThat(a.get("variationMasse").decimalValue()).isEqualByComparingTo("1500.00");
        assertThat(a.get("variationPourcentage").decimalValue()).isEqualByComparingTo("100.0");
        assertThat(a.get("variationEffectif").asLong()).isZero();
        assertThat(a.get("coutMoyen").decimalValue()).isEqualByComparingTo("3000.00");
        assertThat(a.get("fonctionPrincipale").get("libelle").asString()).isEqualTo("F-" + ref.suffixe());
        assertThat(a.get("fonctionPrincipale").get("effectif").asLong()).isEqualTo(1);
        JsonNode baisse = groupes.get(1);
        assertThat(baisse.get("id").asLong()).isEqualTo(b.chantierId());
        assertThat(baisse.get("variationMasse").decimalValue()).isEqualByComparingTo("-3000.00");
        assertThat(baisse.get("variationPourcentage").decimalValue()).isEqualByComparingTo("-50.0");
        // Les groupes d'un seul des deux mois sont en dernier, sans variation inventée.
        List<String> statuts = List.of(groupes.get(2).get("statut").asString(), groupes.get(3).get("statut").asString());
        assertThat(statuts).containsExactlyInAnyOrder("NOUVEAU", "DISPARU");
        assertThat(groupes.get(2).get("variationMasse").isNull()).isTrue();
        assertThat(groupes.get(2).get("variationPourcentage").isNull()).isTrue();

        assertThat(resultat.get("plusForteHausse").get("id").asLong()).isEqualTo(ref.chantierId());
        assertThat(resultat.get("plusForteBaisse").get("id").asLong()).isEqualTo(b.chantierId());
        assertThat(resultat.get("plusForteHausseDuPerimetre").get("id").asLong()).isEqualTo(ref.chantierId());
        // Masse : 3 000 + 3 000 + 3 000 contre 1 500 + 6 000 + 3 000 ; effectif : 3 contre 3.
        JsonNode total = resultat.get("total");
        assertThat(total.get("masse").decimalValue()).isEqualByComparingTo("9000.00");
        assertThat(total.get("masseReference").decimalValue()).isEqualByComparingTo("10500.00");
        assertThat(total.get("variationMasse").decimalValue()).isEqualByComparingTo("-1500.00");
        assertThat(total.get("variationPourcentage").decimalValue()).isEqualByComparingTo("-14.3");
        assertThat(total.get("variationEffectif").asLong()).isZero();
        assertThat(resultat.get("definitions").get("variationPourcentage").asString()).contains("pourcentage");
        assertVue(resultat, "paie", "analytique", Map.of("periode", periode.toString()));

        JsonNode croissant = appeler("paie_comparer", avec(avec(base, "tri", "VARIATION_MASSE"), "sens", "ASC"));
        assertThat(croissant.get("groupes")).hasSize(4);
        assertThat(croissant.get("groupes").get(0).get("id").asLong()).isEqualTo(b.chantierId());
        assertThat(croissant.get("plusForteHausseDuPerimetre").get("id").asLong()).isEqualTo(ref.chantierId());
    }

    @Test
    void paie_comparer_compare_le_mois_precedent_par_defaut_et_refuse_un_mois_mal_forme() throws Exception {
        donnees.creerBulletin(ref, periode.minusMonths(1), new BigDecimal("1500.00"));
        JsonNode resultat = appeler("paie_comparer", Map.of("dimension", "FONCTION", "periode", periode.toString(),
                "chantierIds", List.of(ref.chantierId())));
        assertThat(resultat.get("periodeReference").asString()).isEqualTo(periode.minusMonths(1).toString());
        JsonNode fonction = resultat.get("groupes").get(0);
        assertThat(fonction.get("variationMasse").decimalValue()).isEqualByComparingTo("1500.00");
        assertThat(fonction.get("fonctionPrincipale").isNull()).isTrue();

        JsonNode refus = rpc(toutVoir, "tools/call", Map.of("name", "paie_comparer",
                "arguments", Map.of("dimension", "CHANTIER", "periodeReference", "septembre 2026")));
        assertThat(refus.get("isError").asBoolean()).isTrue();
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
        EffectifMoisDto attendu = effectifs.tendances(new EffectifsCriteria(
                List.of(ref.chantierId(), parti.chantierId(), arrive.chantierId(), arriveAussi.chantierId()), null, null))
                .stream().filter(m -> m.periode().equals(periode)).findFirst().orElseThrow();
        assertThat(mois.get("effectif").asLong()).isEqualTo(3);
        assertThat(mois.get("effectifMoisPrecedent").asLong()).isEqualTo(attendu.effectifMoisPrecedent()).isEqualTo(2);
        assertThat(mois.get("variation").asLong()).isEqualTo(attendu.variation()).isEqualTo(1);
        assertThat(mois.get("entrees").asLong()).isEqualTo(attendu.entrees()).isEqualTo(2);
        assertThat(mois.get("plusPayes").asLong()).isEqualTo(attendu.plusPayes()).isEqualTo(1);
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
        var parcoursApi = parcoursEmploye.parcours(ref.employeId());
        assertThat(parcours.get("indicateurs").get("moisPayes").asInt()).isEqualTo(1);
        assertThat(parcours.get("indicateurs").get("moisPayes").asInt()).isEqualTo(parcoursApi.indicateurs().moisPayes());
        assertThat(parcours.get("mois").get(0).get("salaireTotal").decimalValue()).isEqualByComparingTo("3000.00");
        assertThat(parcours.get("mois")).hasSize(parcoursApi.mois().size());

        JsonNode sorties = appeler("employes_sorties", Map.of("periode", periode.toString()));
        var sortiesApi = employes.sortiesDuMois(periode);
        assertThat(sorties.get("nombre").asLong()).isEqualTo(1);
        assertThat(sorties.get("nombre").asLong()).isEqualTo(sortiesApi.nombre());
        assertThat(sorties.get("parMotif").get("STC").asLong()).isEqualTo(1);
        assertThat(sortiesApi.parMotif()).containsEntry("STC", 1L);
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
        JsonNode premierePageRoles = appeler("roles_lister", Map.of("limite", 1, "page", 0));
        assertThat(premierePageRoles.get("roles")).hasSize(1);
        assertThat(premierePageRoles.get("page").asInt()).isZero();
        if (premierePageRoles.get("total").asLong() > 1) {
            JsonNode pageSuivanteRoles = appeler("roles_lister", Map.of("limite", 1, "page", 1));
            assertThat(pageSuivanteRoles.get("roles")).hasSize(1);
            assertThat(pageSuivanteRoles.get("page").asInt()).isEqualTo(1);
            assertThat(pageSuivanteRoles.get("total").asLong()).isEqualTo(premierePageRoles.get("total").asLong());
        }

        JsonNode journal = appeler("audit_rechercher", Map.of("action", "MCP_ROLES_LISTER", "limite", 5));
        assertThat(journal.get("entrees").size()).isPositive();
        assertThat(journal.get("page").asInt()).isZero();
        assertThat(journal.get("entrees").get(0).get("action").asString()).isEqualTo("MCP_ROLES_LISTER");

        JsonNode historique = appeler("audit_historique", Map.of("entite", "Employee", "id", ref.employeId()));
        assertThat(historique.get("total").asLong()).isPositive();
        assertThat(historique.get("page").asInt()).isZero();
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
        appels.put("paie_comparer", Map.of("periode", periode.toString(), "dimension", "CHANTIER"));
        appels.put("paie_mouvements", Map.of("periode", periode.toString()));
        appels.put("paie_qualite", Map.of("periode", periode.toString()));
        appels.put("paie_bulletins_rechercher", Map.of("periode", periode.toString()));
        appels.put("rapport_preparer", Map.of("periode", periode.toString()));
        appels.put("heures_supp_periodes", Map.of());
        appels.put("heures_supp_import_prerequis", Map.of("periode", periode.toString(), "chantierId", ref.chantierId()));
        appels.put("heures_supp_indicateurs", Map.of("periode", periode.toString()));
        appels.put("heures_supp_rechercher", Map.of("periode", periode.toString()));
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
        // Les refus de @PreAuthorize sont audités par l'écouteur d'événements de sécurité, comme ceux de l'API REST.
        return jdbc.queryForObject("""
                SELECT count(*) FROM audit_journal WHERE action = 'ACCES_REFUSE' AND perimetre ->> 'route' = '/mcp'""",
                Long.class);
    }

    private String jeton(Set<String> codes) {
        Utilisateur utilisateur = creerUtilisateur(codes, true);
        return agents.emettreJeton(utilisateur.getId()).jeton();
    }
}

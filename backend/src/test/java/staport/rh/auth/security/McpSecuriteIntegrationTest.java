package staport.rh.auth.security;

import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.PlainHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.PlainJWT;
import com.nimbusds.jwt.SignedJWT;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import staport.rh.auth.entities.Permission;
import staport.rh.auth.entities.Utilisateur;
import staport.rh.support.ClesAgentDeTest;
import staport.rh.support.McpIntegrationTestBase;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Consumer;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * T4 (docs/ia.md) : jeton délégué RS256, JWKS et route {@code /mcp} protégée, sur l'application complète et un vrai
 * serveur HTTP (la servlet MCP n'est pas atteinte par MockMvc). Chaque refus de la liste du design est prouvé ici.
 */
class McpSecuriteIntegrationTest extends McpIntegrationTestBase {

    private static final RSAKey CLE_INCONNUE = ClesAgentDeTest.generer("cle-courante");
    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Autowired
    private JwtService jwtService;

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private Utilisateur agent;

    @BeforeEach
    void creerUtilisateurAgent() {
        agent = creerUtilisateur(Set.of("IA_UTILISER", "EQUIPE_READ"), true);
    }

    // --- émission du jeton et JWKS ---

    @Test
    void le_jeton_agent_est_un_rs256_de_cinq_minutes_sans_permission_pour_l_ia_et_mcp() throws Exception {
        SignedJWT jeton = SignedJWT.parse(emettre(agent));

        assertThat(jeton.getHeader().getAlgorithm()).isEqualTo(JWSAlgorithm.RS256);
        assertThat(jeton.getHeader().getKeyID()).isEqualTo("cle-courante");
        JWTClaimsSet claims = jeton.getJWTClaimsSet();
        assertThat(claims.getAudience()).containsExactlyInAnyOrder("erp-rh-ia", "erp-rh-mcp");
        assertThat(claims.getSubject()).isEqualTo(agent.getUsername());
        assertThat(claims.getStringClaim("scope")).isEqualTo("mcp:lecture");
        assertThat(claims.getClaims()).doesNotContainKeys("permissions", "roles");
        assertThat(Duration.between(claims.getIssueTime().toInstant(), claims.getExpirationTime().toInstant()))
                .isEqualTo(Duration.ofMinutes(5));
        assertThat(entreesJournal("JETON_AGENT_EMIS", agent.getId())).isEqualTo(1);
    }

    @Test
    void le_jeton_agent_est_refuse_sans_le_droit_ia_dans_le_jeton_de_connexion() throws Exception {
        String sansDroit = jwtService.genererAccessToken(agent, Set.of("EQUIPE_READ"), Set.of());
        assertThat(post("/auth/jetons/agent", sansDroit).statusCode()).isEqualTo(403);
    }

    @Test
    void le_jeton_agent_est_refuse_si_le_droit_a_ete_retire_depuis_la_connexion() throws Exception {
        String connexion = jetonDeConnexion(agent);
        retirerPermissionIa(agent);

        assertThat(post("/auth/jetons/agent", connexion).statusCode()).isEqualTo(403);
        assertThat(entreesJournal("JETON_AGENT_REFUSE", agent.getId())).isEqualTo(1);
    }

    @Test
    void le_jeton_agent_est_refuse_a_un_compte_desactive() throws Exception {
        String connexion = jetonDeConnexion(agent);
        desactiver(agent);
        assertThat(post("/auth/jetons/agent", connexion).statusCode()).isEqualTo(403);
    }

    @Test
    void le_jwks_est_public_et_ne_publie_que_des_cles_publiques() throws Exception {
        HttpResponse<String> reponse = http.send(HttpRequest.newBuilder(uri("/.well-known/jwks.json")).GET().build(),
                HttpResponse.BodyHandlers.ofString());

        assertThat(reponse.statusCode()).isEqualTo(200);
        JsonNode cles = JSON.readTree(reponse.body()).get("keys");
        assertThat(cles).hasSize(2);
        List<String> kids = new ArrayList<>();
        cles.forEach(cle -> {
            kids.add(cle.get("kid").asString());
            assertThat(cle.has("d")).as("aucune partie privée").isFalse();
            assertThat(cle.get("alg").asString()).isEqualTo("RS256");
        });
        assertThat(kids).containsExactly("cle-courante", "cle-precedente");
    }

    // --- route /mcp : accepté ---

    @Test
    void un_jeton_agent_valide_appelle_l_outil_d_identite_reconstruite_depuis_la_base() throws Exception {
        JsonNode resultat = appelerIdentite(emettre(agent));

        assertThat(resultat.get("utilisateur").asString()).isEqualTo(agent.getUsername());
        assertThat(autorites(resultat)).contains("IA_UTILISER", "EQUIPE_READ", "SCOPE_mcp:lecture");
    }

    @Test
    void un_refus_individuel_pose_apres_l_emission_s_applique_au_prochain_appel() throws Exception {
        String jeton = emettre(agent);
        refuserIndividuellement(agent, "EQUIPE_READ");

        assertThat(autorites(appelerIdentite(jeton))).contains("IA_UTILISER").doesNotContain("EQUIPE_READ");
    }

    @Test
    void un_jeton_signe_avec_la_cle_precedente_reste_accepte_pendant_le_changement_de_cle() throws Exception {
        String jeton = signer(CLE_PRECEDENTE, claimsAgent(agent).build());
        assertThat(appelerIdentite(jeton).get("utilisateur").asString()).isEqualTo(agent.getUsername());
    }

    // --- route /mcp : refusé ---

    @Test
    void sans_jeton_mcp_repond_401() throws Exception {
        assertThat(mcp(null, Map.of()).statusCode()).isEqualTo(401);
    }

    @Test
    void un_jeton_de_connexion_rest_est_refuse_par_mcp() throws Exception {
        assertThat(mcp(jetonDeConnexion(agent), Map.of()).statusCode()).isEqualTo(401);
    }

    @Test
    void un_jeton_agent_est_refuse_par_les_routes_rest() throws Exception {
        HttpResponse<String> reponse = http.send(HttpRequest.newBuilder(uri("/auth/me"))
                .header("Authorization", "Bearer " + emettre(agent)).GET().build(), HttpResponse.BodyHandlers.ofString());
        assertThat(reponse.statusCode()).isEqualTo(401);
    }

    @Test
    void une_signature_d_une_autre_cle_est_refusee() throws Exception {
        assertThat(mcp(signer(CLE_INCONNUE, claimsAgent(agent).build()), Map.of()).statusCode()).isEqualTo(401);
    }

    @Test
    void une_mauvaise_audience_est_refusee() throws Exception {
        String jeton = signer(CLE_COURANTE, claimsAgent(agent).audience(List.of("erp-rh-ia")).build());
        assertThat(mcp(jeton, Map.of()).statusCode()).isEqualTo(401);
    }

    @Test
    void un_mauvais_emetteur_est_refuse() throws Exception {
        String jeton = signer(CLE_COURANTE, claimsAgent(agent).issuer("autre-application").build());
        assertThat(mcp(jeton, Map.of()).statusCode()).isEqualTo(401);
    }

    @Test
    void un_jeton_expire_est_refuse() throws Exception {
        Instant passe = Instant.now().minus(Duration.ofHours(1));
        String jeton = signer(CLE_COURANTE, claimsAgent(agent).issueTime(Date.from(passe))
                .notBeforeTime(Date.from(passe)).expirationTime(Date.from(passe.plusSeconds(300))).build());
        assertThat(mcp(jeton, Map.of()).statusCode()).isEqualTo(401);
    }

    @Test
    void un_jeton_non_signe_est_refuse() throws Exception {
        String jeton = new PlainJWT(new PlainHeader(), claimsAgent(agent).build()).serialize();
        assertThat(mcp(jeton, Map.of()).statusCode()).isEqualTo(401);
    }

    @Test
    void un_jeton_sans_scope_mcp_est_refuse() throws Exception {
        String jeton = signer(CLE_COURANTE, claimsAgent(agent).claim("scope", "autre").build());
        assertThat(mcp(jeton, Map.of()).statusCode()).isEqualTo(403);
    }

    @Test
    void un_navigateur_est_refuse_meme_avec_un_jeton_valide() throws Exception {
        assertThat(mcp(emettre(agent), Map.of("Origin", "http://localhost:4200")).statusCode()).isEqualTo(403);
    }

    @Test
    void un_compte_desactive_apres_l_emission_est_refuse() throws Exception {
        String jeton = emettre(agent);
        desactiver(agent);
        assertThat(mcp(jeton, Map.of()).statusCode()).isEqualTo(401);
    }

    @Test
    void un_droit_ia_retire_apres_l_emission_est_refuse() throws Exception {
        String jeton = emettre(agent);
        retirerPermissionIa(agent);
        assertThat(mcp(jeton, Map.of()).statusCode()).isEqualTo(403);
    }

    @Test
    void un_identifiant_qui_ne_correspond_pas_au_compte_est_refuse() throws Exception {
        Utilisateur autre = creerUtilisateur(Set.of("IA_UTILISER"), true);
        String jeton = signer(CLE_COURANTE, claimsAgent(agent).claim("uid", autre.getId()).build());
        assertThat(mcp(jeton, Map.of()).statusCode()).isEqualTo(401);
    }

    // --- outils ---

    private String emettre(Utilisateur utilisateur) throws Exception {
        HttpResponse<String> reponse = post("/auth/jetons/agent", jetonDeConnexion(utilisateur));
        assertThat(reponse.statusCode()).as(reponse.body()).isEqualTo(200);
        assertThat(reponse.headers().firstValue("Cache-Control")).hasValueSatisfying(v -> assertThat(v).contains("no-store"));
        return JSON.readTree(reponse.body()).get("jeton").asString();
    }

    private String jetonDeConnexion(Utilisateur utilisateur) {
        return jwtService.genererAccessToken(utilisateur, Set.of("IA_UTILISER", "EQUIPE_READ"), Set.of());
    }

    private JsonNode appelerIdentite(String jeton) throws Exception {
        HttpResponse<String> reponse = mcp(jeton, Map.of());
        assertThat(reponse.statusCode()).as(reponse.body()).isEqualTo(200);
        JsonNode resultat = JSON.readTree(corpsJson(reponse)).get("result");
        assertThat(resultat.get("isError").asBoolean()).isFalse();
        return resultat.get("structuredContent");
    }

    private static List<String> autorites(JsonNode identite) {
        List<String> valeurs = new ArrayList<>();
        identite.get("autorites").forEach(valeur -> valeurs.add(valeur.asString()));
        return valeurs;
    }

    private HttpResponse<String> mcp(String jeton, Map<String, String> entetes) throws Exception {
        String corps = """
                {"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"systeme_identite","arguments":{}}}""";
        HttpRequest.Builder requete = HttpRequest.newBuilder(uri("/mcp"))
                .header("Content-Type", "application/json")
                .header("Accept", "application/json, text/event-stream")
                .header("MCP-Protocol-Version", "2025-11-25")
                .POST(HttpRequest.BodyPublishers.ofString(corps));
        if (jeton != null) {
            requete.header("Authorization", "Bearer " + jeton);
        }
        entetes.forEach(requete::header);
        return http.send(requete.build(), HttpResponse.BodyHandlers.ofString());
    }

    /** Réponse JSON directe, ou premier événement SSE {@code data:}. */
    private static String corpsJson(HttpResponse<String> reponse) {
        String corps = reponse.body().strip();
        if (corps.startsWith("{")) {
            return corps;
        }
        return corps.lines().filter(ligne -> ligne.startsWith("data:")).map(ligne -> ligne.substring(5).strip())
                .findFirst().orElseThrow();
    }

    private HttpResponse<String> post(String chemin, String jeton) throws Exception {
        return http.send(HttpRequest.newBuilder(uri(chemin)).header("Authorization", "Bearer " + jeton)
                .POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
    }

    private URI uri(String chemin) {
        return URI.create("http://127.0.0.1:" + port + chemin);
    }

    private JWTClaimsSet.Builder claimsAgent(Utilisateur utilisateur) {
        Instant maintenant = Instant.now();
        return new JWTClaimsSet.Builder()
                .issuer("paie")
                .subject(utilisateur.getUsername())
                .audience(List.of("erp-rh-ia", "erp-rh-mcp"))
                .issueTime(Date.from(maintenant))
                .notBeforeTime(Date.from(maintenant))
                .expirationTime(Date.from(maintenant.plusSeconds(300)))
                .jwtID(UUID.randomUUID().toString())
                .claim("uid", utilisateur.getId())
                .claim("scope", "mcp:lecture");
    }

    private static String signer(RSAKey cle, JWTClaimsSet claims) throws Exception {
        SignedJWT jeton = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(cle.getKeyID())
                .type(JOSEObjectType.JWT).build(), claims);
        jeton.sign(new RSASSASigner(cle));
        return jeton.serialize();
    }

    private void retirerPermissionIa(Utilisateur utilisateur) {
        modifier(utilisateur, u -> u.getRoles().forEach(role ->
                role.getPermissions().removeIf(p -> p.getCode().equals("IA_UTILISER"))));
    }

    private void refuserIndividuellement(Utilisateur utilisateur, String code) {
        Permission permission = permissions.findByCodeIn(List.of(code)).getFirst();
        modifier(utilisateur, u -> u.getPermissionsRefusees().add(permission));
    }

    private void desactiver(Utilisateur utilisateur) {
        modifier(utilisateur, u -> u.setActif(false));
    }

    private void modifier(Utilisateur utilisateur, Consumer<Utilisateur> modification) {
        transaction.executeWithoutResult(statut -> {
            Utilisateur charge = utilisateurs.findById(utilisateur.getId()).orElseThrow();
            modification.accept(charge);
            charge.getRoles().forEach(roles::save);
            utilisateurs.save(charge);
        });
    }

    private long entreesJournal(String action, Long utilisateurId) {
        return jdbc.queryForObject("SELECT count(*) FROM audit_journal WHERE action = ? AND utilisateur_id = ?",
                Long.class, action, utilisateurId);
    }
}

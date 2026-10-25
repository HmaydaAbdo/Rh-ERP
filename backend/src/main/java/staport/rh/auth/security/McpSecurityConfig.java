package staport.rh.auth.security;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.nimbusds.jose.proc.JWSVerificationKeySelector;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jwt.proc.DefaultJWTProcessor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.authorization.AuthorizationManagers;
import org.springframework.security.authorization.AuthorityAuthorizationManager;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import staport.rh.audit.events.AuditAuthenticationEntryPoint;
import staport.rh.audit.metrics.AuditMetrics;
import staport.rh.audit.services.interfaces.IAuditJournalWriter;
import staport.rh.auth.dtos.response.IdentiteAgentDto;
import staport.rh.auth.services.interfaces.IAgentService;
import staport.rh.common.logging.MdcRequestFilter;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * Chaîne de sécurité de la route {@code /mcp} (docs/ia.md, § 5), prioritaire sur {@link SecurityConfig}. Seul le
 * jeton délégué RS256 de l'agent est accepté : un Access Token REST (HS256) est refusé, et un jeton agent est refusé
 * par toutes les routes REST. À chaque requête, le compte et ses permissions effectives sont relus en base ; un compte
 * désactivé est refusé (401) et un droit {@code IA_UTILISER} retiré l'est aussi (403), même avec un jeton encore valide.
 * Un navigateur (en-tête {@code Origin}) n'est jamais admis : seul le service IA appelle MCP, par le réseau interne.
 */
@Configuration
@ConditionalOnBooleanProperty("security.mcp.enabled")
public class McpSecurityConfig {

    private static final String CLAIM_USER_ID = "uid";

    @Bean
    @Order(1)
    public SecurityFilterChain mcpSecurityFilterChain(HttpSecurity http, AgentSigningKeys cles, IAgentService agents,
                                                      @Value("${spring.application.name}") String emetteur,
                                                      IAuditJournalWriter ecrivainAudit, AuditMetrics metriquesAudit,
                                                      JsonMapper jsonMapper) throws Exception {
        AuditAuthenticationEntryPoint pointEntreeAudit = new AuditAuthenticationEntryPoint(
                ecrivainAudit, metriquesAudit, jsonMapper);
        http
                .securityMatcher("/mcp", "/mcp/**")
                .cors(cors -> cors.disable())
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> {
                    auth.requestMatchers(requete -> requete.getHeader("Origin") != null).denyAll();
                    auth.anyRequest().access(AuthorizationManagers.allOf(
                            AuthorityAuthorizationManager.hasAuthority(JetonAgent.AUTORITE_LECTURE),
                            AuthorityAuthorizationManager.hasAuthority(JetonAgent.PERMISSION_IA)));
                })
                .exceptionHandling(exceptions -> exceptions.authenticationEntryPoint(pointEntreeAudit))
                .oauth2ResourceServer(serveur -> serveur
                        .authenticationEntryPoint(pointEntreeAudit)
                        .jwt(jwt -> jwt.decoder(decodeur(cles, emetteur))
                                .jwtAuthenticationConverter(jeton -> authentifier(jeton, agents))))
                .addFilterAfter(new MdcRequestFilter(), BearerTokenAuthenticationFilter.class);
        return http.build();
    }

    /** Décodeur du seul jeton agent : RS256, clés publiques acceptées, émetteur, audience MCP, dates et scope. */
    static NimbusJwtDecoder decodeur(AgentSigningKeys cles, String emetteur) {
        DefaultJWTProcessor<SecurityContext> processeur = new DefaultJWTProcessor<>();
        processeur.setJWSKeySelector(new JWSVerificationKeySelector<>(JWSAlgorithm.RS256,
                new ImmutableJWKSet<>(cles.publiques())));
        NimbusJwtDecoder decodeur = new NimbusJwtDecoder(processeur);
        decodeur.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefaultWithIssuer(emetteur),
                jeton -> {
                    boolean valide = jeton.getAudience() != null && jeton.getAudience().contains(JetonAgent.AUDIENCE_MCP)
                            && jeton.getExpiresAt() != null && jeton.getIssuedAt() != null
                            && jeton.getSubject() != null && !jeton.getSubject().isBlank()
                            && jeton.getClaim(CLAIM_USER_ID) instanceof Number;
                    return valide ? OAuth2TokenValidatorResult.success()
                            : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token",
                                    "Le jeton n'est pas un jeton agent MCP d'ERP-RH", null));
                }));
        return decodeur;
    }

    private static JwtAuthenticationToken authentifier(Jwt jeton, IAgentService agents) {
        Number utilisateurId = jeton.getClaim(CLAIM_USER_ID);
        IdentiteAgentDto identite = agents.identiteActive(utilisateurId.longValue())
                .filter(trouvee -> trouvee.username().equals(jeton.getSubject()))
                .orElseThrow(() -> new InvalidBearerTokenException("Compte inconnu ou désactivé"));
        List<GrantedAuthority> autorites = new ArrayList<>();
        identite.permissions().forEach(permission -> autorites.add(new SimpleGrantedAuthority(permission)));
        identite.roles().forEach(role -> autorites.add(new SimpleGrantedAuthority(role)));
        String scope = jeton.getClaimAsString(JetonAgent.CLAIM_SCOPE);
        if (scope != null && Set.of(scope.split(" ")).contains(JetonAgent.SCOPE_LECTURE)) {
            autorites.add(new SimpleGrantedAuthority(JetonAgent.AUTORITE_LECTURE));
        }
        return new JwtAuthenticationToken(jeton, autorites, identite.username());
    }
}

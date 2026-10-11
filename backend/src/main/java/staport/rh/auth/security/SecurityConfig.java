package staport.rh.auth.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authorization.AuthorizationEventPublisher;
import org.springframework.security.authorization.SpringAuthorizationEventPublisher;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.oauth2.server.resource.OAuth2ResourceServerConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import staport.rh.common.logging.MdcRequestFilter;
import staport.rh.audit.events.AuditAuthenticationEntryPoint;
import staport.rh.audit.metrics.AuditMetrics;
import staport.rh.audit.services.interfaces.IAuditJournalWriter;
import tools.jackson.databind.json.JsonMapper;

import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.util.Base64;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Resource Server JWT (Access Token auto-émis, voir {@link JwtService}). Session stateless :
 * l'état de connexion vit uniquement dans le Refresh Token (cookie httpOnly, voir
 * {@code AuthController}), jamais côté serveur pour l'Access Token.
 *
 * CSRF désactivé : tous les endpoints métier s'authentifient par l'en-tête {@code Authorization}
 * (immunisé au CSRF, un site tiers ne peut pas le positionner), pas par le cookie. Seul
 * {@code /auth/refresh}/{@code /auth/logout} lisent le cookie de Refresh Token ; le pire cas d'un
 * CSRF sur ces deux endpoints est une rotation/révocation prématurée du Refresh Token de la
 * victime (déconnexion forcée), jamais une fuite de données — risque résiduel documenté
 * volontairement accepté (voir conventions/security.md, "Points d'attention").
 */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    private final String jwtSecret;
    private final boolean documentationApiActive;
    private final List<String> allowedCorsOrigins;

    public SecurityConfig(@Value("${security.jwt.secret}") String jwtSecret,
                          @Value("${springdoc.api-docs.enabled}") boolean documentationApiActive,
                          @Value("${security.cors.allowed-origins}") String allowedCorsOrigins) {
        this.jwtSecret = jwtSecret;
        this.documentationApiActive = documentationApiActive;
        this.allowedCorsOrigins = validateCorsOrigins(allowedCorsOrigins);
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    /**
     * Fait publier à Spring Security un {@code AuthorizationDeniedEvent} pour chaque refus d'accès, qu'il vienne d'un
     * {@code @PreAuthorize} ou de la chaîne de filtres : un seul point d'accroche pour journaliser tous les {@code 403}
     * (voir {@code EcouteurEvenementsSecurite}).
     */
    @Bean
    public AuthorizationEventPublisher authorizationEventPublisher(ApplicationEventPublisher publieur) {
        return new SpringAuthorizationEventPublisher(publieur);
    }

    @Bean
    public JwtDecoder jwtDecoder() {
        SecretKeySpec key = new SecretKeySpec(Base64.getDecoder().decode(jwtSecret), "HmacSHA256");
        return NimbusJwtDecoder.withSecretKey(key).macAlgorithm(org.springframework.security.oauth2.jose.jws.MacAlgorithm.HS256).build();
    }

    /**
     * Convertit les claims "permissions" et "roles" du JWT en {@link GrantedAuthority} — un rôle
     * (ex. "SYSTEM_ADMIN") est utilisable directement via {@code hasAuthority('SYSTEM_ADMIN')},
     * exactement comme une permission (ex. "EMPLOYEE_DELETE").
     */
    private JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtGrantedAuthoritiesConverter defaultConverter = new JwtGrantedAuthoritiesConverter();
        defaultConverter.setAuthorityPrefix("");
        defaultConverter.setAuthoritiesClaimName("permissions");

        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(jwt -> {
            Collection<GrantedAuthority> permissions = defaultConverter.convert(jwt);
            List<String> roles = jwt.getClaimAsStringList("roles");
            Stream<GrantedAuthority> roleAuthorities = (roles == null ? List.<String>of() : roles).stream()
                    .map(SimpleGrantedAuthority::new);
            return Stream.concat(permissions == null ? Stream.<GrantedAuthority>empty() : permissions.stream(), roleAuthorities)
                    .collect(Collectors.toSet());
        });
        return converter;
    }

    /** Origines navigateur explicites, fournies par l'environnement de déploiement. */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(allowedCorsOrigins);
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        configuration.setExposedHeaders(List.of(MdcRequestFilter.EN_TETE_REQUEST_ID));
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    private static List<String> validateCorsOrigins(String rawOrigins) {
        if (rawOrigins == null || rawOrigins.isBlank()) {
            throw new IllegalArgumentException("CORS_ALLOWED_ORIGINS doit contenir au moins une origine");
        }
        List<String> normalized = Stream.of(rawOrigins.split(",", -1))
                .map(String::trim)
                .toList();
        if (normalized.isEmpty() || normalized.stream().anyMatch(String::isEmpty)) {
            throw new IllegalArgumentException("CORS_ALLOWED_ORIGINS doit contenir au moins une origine");
        }
        for (String origin : normalized) {
            URI uri;
            try {
                uri = URI.create(origin);
            } catch (IllegalArgumentException e) {
                throw new IllegalArgumentException("Origine CORS invalide : " + origin, e);
            }
            String scheme = uri.getScheme();
            if ((scheme == null || !(scheme.toLowerCase(Locale.ROOT).equals("http")
                    || scheme.toLowerCase(Locale.ROOT).equals("https")))
                    || uri.getHost() == null || uri.getUserInfo() != null
                    || uri.getQuery() != null || uri.getFragment() != null
                    || (uri.getPath() != null && !uri.getPath().isEmpty())
                    || uri.getPort() > 65535
                    || origin.contains("*")) {
                throw new IllegalArgumentException("Origine CORS invalide (schéma+hôte+port attendus) : " + origin);
            }
        }
        return List.copyOf(normalized);
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http, IAuditJournalWriter ecrivainAudit,
                                                   AuditMetrics metriquesAudit, JsonMapper jsonMapper) throws Exception {
        AuditAuthenticationEntryPoint pointEntreeAudit = new AuditAuthenticationEntryPoint(
                ecrivainAudit, metriquesAudit, jsonMapper);
        http
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> {
                    auth.requestMatchers(HttpMethod.POST, "/auth/login", "/auth/refresh", "/auth/forgot-password", "/auth/reset-password").permitAll();
                    auth.requestMatchers(HttpMethod.GET, "/auth/password-policy").permitAll();
                    auth.requestMatchers("/actuator/health", "/actuator/prometheus").permitAll();
                    // Publique seulement quand la documentation est allumée (développement) ; sinon ces routes ne sont rien.
                    if (documentationApiActive) {
                        auth.requestMatchers("/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs/**").permitAll();
                    }
                    auth.requestMatchers("/actuator/**").hasAuthority("SYSTEM_ADMIN");
                    auth.anyRequest().authenticated();
                })
                .exceptionHandling(exceptions -> exceptions.authenticationEntryPoint(pointEntreeAudit))
                .oauth2ResourceServer((OAuth2ResourceServerConfigurer<HttpSecurity> resourceServer) -> resourceServer
                        .authenticationEntryPoint(pointEntreeAudit)
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter())))
                // Identifiant de requête et utilisateur dans le MDC, dès que l'authentification est faite : les contrôles
                // d'accès qui suivent (et leurs refus) portent déjà l'identifiant (conventions/logging.md).
                .addFilterAfter(new MdcRequestFilter(), BearerTokenAuthenticationFilter.class);

        return http.build();
    }
}

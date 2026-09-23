package staport.rh.auth.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
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
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import javax.crypto.spec.SecretKeySpec;
import java.util.Base64;
import java.util.Collection;
import java.util.List;
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

    public SecurityConfig(@Value("${security.jwt.secret}") String jwtSecret) {
        this.jwtSecret = jwtSecret;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
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

    /**
     * Décision (HMAYDA, 2026-09-23) : CORS ouvert à toute origine. Spring refuse la valeur littérale
     * {@code "*"} pour {@code allowedOrigins} dès lors que {@code allowCredentials} est actif
     * (interdit par la spec CORS) — {@code allowedOriginPatterns("*")} est la façon dont Spring
     * satisfait cette contrainte : il réfléchit l'{@code Origin} de la requête au lieu d'émettre un
     * {@code *} littéral. Risque accepté en connaissance de cause pour {@code /auth/refresh} et
     * {@code /auth/logout} (seuls endpoints lus depuis le cookie Refresh Token) : très atténué en
     * pratique par {@code SameSite=Lax} sur ce cookie (voir {@code AuthController}), qui empêche déjà
     * son envoi sur une requête cross-origin déclenchée par du JS tiers.
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOriginPatterns(List.of("*"));
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.POST, "/auth/login", "/auth/refresh", "/auth/forgot-password", "/auth/reset-password").permitAll()
                        .requestMatchers("/actuator/health", "/actuator/prometheus").permitAll()
                        .requestMatchers("/swagger-ui/**", "/v3/api-docs/**").permitAll()
                        .requestMatchers("/actuator/**").hasAuthority("SYSTEM_ADMIN")
                        .anyRequest().authenticated())
                .oauth2ResourceServer((OAuth2ResourceServerConfigurer<HttpSecurity> resourceServer) -> resourceServer
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter())));

        return http.build();
    }
}

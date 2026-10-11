package staport.rh.auth.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import staport.rh.auth.dtos.request.ForgotPasswordRequestDto;
import staport.rh.auth.dtos.request.LoginRequestDto;
import staport.rh.auth.dtos.request.ResetPasswordRequestDto;
import staport.rh.auth.dtos.response.LoginResponseDto;
import staport.rh.auth.dtos.response.UserResponseDto;
import staport.rh.auth.exceptions.InvalidRefreshTokenException;
import staport.rh.auth.services.interfaces.IAuthService;
import staport.rh.auth.services.interfaces.IUserService;

/**
 * Endpoints publics (pas d'authentification requise, voir SecurityConfig) sauf /auth/me. Le
 * Refresh Token n'est jamais présent dans un corps JSON — uniquement en cookie httpOnly, jamais
 * lisible par JavaScript (voir conventions/security.md).
 */
@RestController
@Tag(name = "Authentification", description = "Connexion, session, mot de passe oublié")
public class AuthController {

    private static final String COOKIE_NAME = "refresh_token";
    private static final String COOKIE_PATH = "/auth";

    private final IAuthService authService;
    private final IUserService userService;
    private final boolean cookieSecure;

    public AuthController(IAuthService authService, IUserService userService,
                           @Value("${security.cookie.secure}") boolean cookieSecure) {
        this.authService = authService;
        this.userService = userService;
        this.cookieSecure = cookieSecure;
    }

    @PostMapping("/auth/login")
    @Operation(summary = "Ouvrir une session", description = "Renvoie l'Access Token ; le Refresh Token est posé en cookie httpOnly.")
    @ApiResponse(responseCode = "401", description = "Identifiants invalides (réponse identique quel que soit le motif)")
    public ResponseEntity<LoginResponseDto> login(@Valid @RequestBody LoginRequestDto dto) {
        IAuthService.Connexion connexion = authService.login(dto.username(), dto.password());
        return withRefreshCookie(connexion);
    }

    @PostMapping("/auth/refresh")
    @Operation(summary = "Renouveler la session", description = "Rotation à usage unique du Refresh Token (cookie).")
    @ApiResponse(responseCode = "401", description = "Refresh Token absent, expiré ou déjà consommé (sa famille est alors révoquée)")
    public ResponseEntity<LoginResponseDto> refresh(
            @CookieValue(name = COOKIE_NAME, required = false) String refreshToken) {
        if (refreshToken == null) {
            throw new InvalidRefreshTokenException();
        }
        IAuthService.Connexion connexion = authService.refresh(refreshToken);
        return withRefreshCookie(connexion);
    }

    @PostMapping("/auth/logout")
    @Operation(summary = "Fermer la session")
    @ApiResponse(responseCode = "204", description = "Session fermée, cookie effacé")
    public ResponseEntity<Void> logout(@CookieValue(name = COOKIE_NAME, required = false) String refreshToken) {
        if (refreshToken != null) {
            authService.logout(refreshToken);
        }
        ResponseCookie expiredCookie = ResponseCookie.from(COOKIE_NAME, "")
                .httpOnly(true)
                .secure(cookieSecure)
                .sameSite("Lax")
                .path(COOKIE_PATH)
                .maxAge(0)
                .build();
        return ResponseEntity.noContent().header("Set-Cookie", expiredCookie.toString()).build();
    }

    @PostMapping("/auth/forgot-password")
    @Operation(summary = "Demander un lien de réinitialisation", description = "Réponse identique que l'adresse corresponde ou non à un compte.")
    @ApiResponse(responseCode = "202", description = "Demande prise en compte")
    public ResponseEntity<Void> forgotPassword(@Valid @RequestBody ForgotPasswordRequestDto dto) {
        authService.demanderReinitialisationMotDePasse(dto.email());
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/auth/reset-password")
    @Operation(summary = "Choisir un nouveau mot de passe", description = "Consomme le lien reçu par courriel et coupe toutes les sessions du compte.")
    @ApiResponse(responseCode = "204", description = "Mot de passe changé")
    @ApiResponse(responseCode = "400", description = "Lien invalide, expiré ou utilisé ; ou mot de passe non conforme à la règle")
    public ResponseEntity<Void> resetPassword(@Valid @RequestBody ResetPasswordRequestDto dto) {
        authService.reinitialiserMotDePasse(dto.token(), dto.nouveauMotDePasse());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/auth/me")
    @Operation(summary = "Lire le compte connecté")
    public ResponseEntity<UserResponseDto> me(@AuthenticationPrincipal Jwt jwt) {
        Long userId = jwt.getClaim("uid");
        return ResponseEntity.ok(userService.findById(userId));
    }

    private ResponseEntity<LoginResponseDto> withRefreshCookie(IAuthService.Connexion connexion) {
        ResponseCookie cookie = ResponseCookie.from(COOKIE_NAME, connexion.refreshTokenBrut())
                .httpOnly(true)
                .secure(cookieSecure)
                .sameSite("Lax")
                .path(COOKIE_PATH)
                .maxAge(IAuthService.REFRESH_TOKEN_TTL)
                .build();
        return ResponseEntity.status(HttpStatus.OK)
                .header("Set-Cookie", cookie.toString())
                .body(connexion.reponse());
    }
}

package staport.rh.auth.services.interfaces;

import staport.rh.auth.dtos.response.LoginResponseDto;

import java.time.Duration;

/**
 * Façade publique du domaine auth pour la connexion/déconnexion/mot de passe oublié. Le Refresh
 * Token brut (à poser en cookie httpOnly) est retourné séparément de l'Access Token — jamais dans
 * un DTO exposé au frontend en JSON.
 */
public interface IAuthService {

    /** Durée de vie du Refresh Token : celle de sa ligne en base et celle de son cookie (source unique). */
    Duration REFRESH_TOKEN_TTL = Duration.ofDays(30);

    record Connexion(LoginResponseDto reponse, String refreshTokenBrut) {
    }

    Connexion login(String username, String motDePasse);

    Connexion refresh(String refreshTokenBrut);

    void logout(String refreshTokenBrut);

    void demanderReinitialisationMotDePasse(String email);

    void reinitialiserMotDePasse(String tokenBrut, String nouveauMotDePasse);

    /**
     * Coupe toutes les sessions d'un compte : ses jetons de rafraîchissement actifs sont révoqués, il devra se reconnecter
     * (son jeton d'accès en cours reste valable jusqu'à son expiration, 15 minutes au plus). Rend le nombre de sessions coupées.
     */
    int revoquerSessions(Long utilisateurId);
}

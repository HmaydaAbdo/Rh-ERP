package staport.rh.auth.services.interfaces;

import staport.rh.auth.dtos.response.LoginResponseDto;

import java.time.Duration;

/**
 * Façade publique du domaine auth pour la connexion/déconnexion/mot de passe oublié. Le Refresh
 * Token brut (à poser en cookie httpOnly) est retourné séparément de l'Access Token — jamais dans
 * un DTO exposé au frontend en JSON.
 */
public interface IAuthService {

    /**
     * Le résultat d'une connexion ou d'un renouvellement : la réponse JSON, le Refresh Token brut et sa durée de vie — celle de sa
     * ligne en base, que le cookie reprend (une seule source : le paramètre « Durée de la session »).
     */
    record Connexion(LoginResponseDto reponse, String refreshTokenBrut, Duration dureeSession) {
    }

    Connexion login(String username, String motDePasse);

    Connexion refresh(String refreshTokenBrut);

    void logout(String refreshTokenBrut);

    void demanderReinitialisationMotDePasse(String email);

    void reinitialiserMotDePasse(String tokenBrut, String nouveauMotDePasse);

    /**
     * Coupe toutes les sessions d'un compte : ses jetons de rafraîchissement actifs sont révoqués, il devra se reconnecter
     * (son jeton d'accès en cours reste valable jusqu'à son expiration : sa durée est un paramètre). Rend le nombre de sessions coupées.
     */
    int revoquerSessions(Long utilisateurId);

    /** Longueur minimale d'un mot de passe : la règle que l'interface rappelle avant l'envoi. */
    int longueurMinimaleMotDePasse();
}

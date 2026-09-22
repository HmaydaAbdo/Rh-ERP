package staport.rh.auth.services.interfaces;

import staport.rh.auth.dtos.response.LoginResponseDto;

/**
 * Façade publique du domaine auth pour la connexion/déconnexion/mot de passe oublié. Le Refresh
 * Token brut (à poser en cookie httpOnly) est retourné séparément de l'Access Token — jamais dans
 * un DTO exposé au frontend en JSON.
 */
public interface IAuthService {

    record Connexion(LoginResponseDto reponse, String refreshTokenBrut) {
    }

    Connexion login(String username, String motDePasse);

    Connexion refresh(String refreshTokenBrut);

    void logout(String refreshTokenBrut);

    void demanderReinitialisationMotDePasse(String email);

    void reinitialiserMotDePasse(String tokenBrut, String nouveauMotDePasse);
}

package staport.rh.auth.dtos.response;

/** La longueur minimale du mot de passe que l'interface rappelle ; le serveur vérifie aussi qu'il diffère de l'identifiant. */
public record PolitiqueMotDePasseDto(int longueurMinimale) {
}

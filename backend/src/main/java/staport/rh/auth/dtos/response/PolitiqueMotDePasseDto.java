package staport.rh.auth.dtos.response;

/** La règle des mots de passe que l'interface rappelle : la longueur minimale (la lettre et le chiffre sont toujours exigés). */
public record PolitiqueMotDePasseDto(int longueurMinimale) {
}

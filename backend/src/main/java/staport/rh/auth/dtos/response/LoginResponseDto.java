package staport.rh.auth.dtos.response;

/** Le Refresh Token n'apparaît jamais ici — il est posé directement en cookie httpOnly par AuthController. */
public record LoginResponseDto(
        String accessToken,
        UserResponseDto utilisateur
) {
}

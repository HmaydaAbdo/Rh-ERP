package staport.rh.auth.dtos.response;

import java.util.Set;

public record RoleResponseDto(
        Long id,
        Long version,
        String nom,
        String description,
        Set<PermissionResponseDto> permissions,
        /** Rôle d'administration de départ : ni supprimable, ni renommable, ni amputable (l'écran verrouille ces champs). */
        boolean protege
) {
}

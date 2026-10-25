package staport.rh.auth.dtos.response;

import java.util.Set;

/**
 * Identité d'un appel MCP reconstruite depuis la base : compte actif, permissions effectives (refus individuels
 * appliqués) et rôles. Jamais déduite des arguments d'un outil.
 */
public record IdentiteAgentDto(Long utilisateurId, String username, Set<String> permissions, Set<String> roles) {

    public IdentiteAgentDto {
        permissions = Set.copyOf(permissions);
        roles = Set.copyOf(roles);
    }
}

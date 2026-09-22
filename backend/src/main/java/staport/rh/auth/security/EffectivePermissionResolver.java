package staport.rh.auth.security;

import org.springframework.stereotype.Component;
import staport.rh.auth.entities.Permission;
import staport.rh.auth.entities.Role;
import staport.rh.auth.entities.Utilisateur;

import java.util.Set;
import java.util.stream.Collectors;

/**
 * Résout l'ensemble effectif de permissions d'un utilisateur : union des permissions de tous ses
 * rôles, moins les deny overrides individuels — voir conventions/security.md, "Règle : deny
 * individuel > permissions des rôles".
 */
@Component
public class EffectivePermissionResolver {

    public Set<String> resolve(Utilisateur utilisateur) {
        Set<String> refusees = utilisateur.getPermissionsRefusees().stream()
                .map(Permission::getCode)
                .collect(Collectors.toSet());

        return utilisateur.getRoles().stream()
                .map(Role::getPermissions)
                .flatMap(Set::stream)
                .map(Permission::getCode)
                .filter(code -> !refusees.contains(code))
                .collect(Collectors.toSet());
    }

    public Set<String> roleNames(Utilisateur utilisateur) {
        return utilisateur.getRoles().stream()
                .map(Role::getNom)
                .collect(Collectors.toSet());
    }
}

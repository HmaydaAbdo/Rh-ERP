package staport.rh.auth.repositories;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import staport.rh.auth.entities.Utilisateur;

import java.util.Optional;

public interface UtilisateurRepository extends JpaRepository<Utilisateur, Long>, JpaSpecificationExecutor<Utilisateur> {

    @EntityGraph(attributePaths = {"roles", "roles.permissions", "permissionsRefusees"})
    Optional<Utilisateur> findByUsername(String username);

    boolean existsByUsername(String username);

    boolean existsByEmail(String email);

    Optional<Utilisateur> findByEmail(String email);

    boolean existsByRoles_Nom(String nom);

    long countByRoles_Id(Long roleId);
}

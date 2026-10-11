package staport.rh.auth.repositories;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import staport.rh.auth.entities.Utilisateur;

import java.util.Optional;

public interface UtilisateurRepository extends JpaRepository<Utilisateur, Long>, JpaSpecificationExecutor<Utilisateur> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from Utilisateur u where u.username = :username")
    Optional<Utilisateur> findByUsernameForUpdate(@Param("username") String username);

    boolean existsByUsername(String username);

    boolean existsByEmail(String email);

    Optional<Utilisateur> findByEmail(String email);

    boolean existsByRoles_Nom(String nom);

    long countByRoles_Id(Long roleId);
}

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
    @Query("select u from Utilisateur u where upper(trim(u.username)) = upper(trim(:username))")
    Optional<Utilisateur> findByUsernameForUpdate(@Param("username") String username);

    boolean existsByUsernameIgnoreCase(String username);

    boolean existsByEmailIgnoreCase(String email);

    @Query("select u from Utilisateur u where upper(trim(u.email)) = upper(trim(:email))")
    Optional<Utilisateur> findByEmail(@Param("email") String email);

    boolean existsByRoles_Nom(String nom);

    long countByRoles_Id(Long roleId);
}

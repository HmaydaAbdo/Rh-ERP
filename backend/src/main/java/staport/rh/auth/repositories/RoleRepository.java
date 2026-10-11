package staport.rh.auth.repositories;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import staport.rh.auth.entities.Role;

import java.util.List;
import java.util.Optional;

public interface RoleRepository extends JpaRepository<Role, Long>, JpaSpecificationExecutor<Role> {

    @EntityGraph(attributePaths = "permissions")
    List<Role> findAllByOrderByNomAsc();

    @EntityGraph(attributePaths = "permissions")
    Optional<Role> findById(Long id);

    boolean existsByNom(String nom);
}

package staport.rh.auth.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import staport.rh.auth.entities.Permission;

import java.util.List;

public interface PermissionRepository extends JpaRepository<Permission, Long> {

    List<Permission> findAllByOrderByCodeAsc();

    List<Permission> findByCodeIn(List<String> codes);
}

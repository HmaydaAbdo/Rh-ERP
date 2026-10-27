package staport.rh.chantier.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;
import staport.rh.chantier.entities.Chantier;

import java.util.Optional;
import java.util.List;

@Repository
public interface ChantierRepository extends JpaRepository<Chantier, Long>, JpaSpecificationExecutor<Chantier> {

    Optional<Chantier> findByCodeIgnoreCase(String code);

    boolean existsByCodeIgnoreCase(String code);

    List<Chantier> findByAfficherSurCarteTrueOrderByCodeAsc();
}

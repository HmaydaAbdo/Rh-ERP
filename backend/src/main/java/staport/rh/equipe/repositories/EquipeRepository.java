package staport.rh.equipe.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;
import staport.rh.equipe.entities.Equipe;

import java.util.Optional;

@Repository
public interface EquipeRepository extends JpaRepository<Equipe, Long>, JpaSpecificationExecutor<Equipe> {

    Optional<Equipe> findByCodeIgnoreCase(String code);

    Optional<Equipe> findByLibelleIgnoreCase(String libelle);
}

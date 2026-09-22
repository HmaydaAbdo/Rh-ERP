package staport.rh.function.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;
import staport.rh.function.entities.Function;

import java.util.Optional;

@Repository
public interface FunctionRepository extends JpaRepository<Function, Long>, JpaSpecificationExecutor<Function> {

    Optional<Function> findByLibelleIgnoreCase(String libelle);

    boolean existsByLibelleIgnoreCase(String libelle);
}

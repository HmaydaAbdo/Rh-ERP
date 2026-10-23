package staport.rh.equipe.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import staport.rh.equipe.entities.Equipe;

import java.util.Optional;
import java.util.List;

@Repository
public interface EquipeRepository extends JpaRepository<Equipe, Long>, JpaSpecificationExecutor<Equipe> {

    Optional<Equipe> findByCodeIgnoreCase(String code);

    Optional<Equipe> findByLibelleIgnoreCase(String libelle);

    @Query("select e.code, e.libelle from Equipe e")
    List<Object[]> findAllCodesAndLibelles();
}

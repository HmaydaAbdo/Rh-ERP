package staport.rh.parametre.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import staport.rh.parametre.entities.Parametre;

@Repository
public interface ParametreRepository extends JpaRepository<Parametre, Long> {
}

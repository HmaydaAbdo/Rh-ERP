package staport.rh.paie.repositories;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import staport.rh.paie.entities.Paie;

import java.time.YearMonth;
import java.util.List;
import java.util.Optional;

@Repository
public interface PaieRepository extends JpaRepository<Paie, Long>, JpaSpecificationExecutor<Paie> {

    @EntityGraph(attributePaths = {"employee", "fonction", "chantier"})
    @Query("SELECT p FROM Paie p WHERE p.id = :id")
    Optional<Paie> findWithReferencesById(Long id);

    @EntityGraph(attributePaths = {"employee", "fonction", "chantier"})
    @Override
    Page<Paie> findAll(org.springframework.data.jpa.domain.Specification<Paie> spec, Pageable pageable);

    boolean existsByEmployee_IdAndPeriode(Long employeeId, YearMonth periode);

    Optional<Paie> findByEmployee_IdAndPeriode(Long employeeId, YearMonth periode);

    @EntityGraph(attributePaths = {"employee", "fonction", "chantier"})
    List<Paie> findByPeriode(YearMonth periode);
}

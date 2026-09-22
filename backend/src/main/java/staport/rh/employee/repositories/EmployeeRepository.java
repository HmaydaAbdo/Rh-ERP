package staport.rh.employee.repositories;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import staport.rh.employee.entities.Employee;

import java.util.Optional;

@Repository
public interface EmployeeRepository extends JpaRepository<Employee, Long>, JpaSpecificationExecutor<Employee> {

    @EntityGraph(attributePaths = {"fonction", "chantier"})
    @Query("SELECT e FROM Employee e WHERE e.id = :id")
    Optional<Employee> findWithReferencesById(Long id);

    @EntityGraph(attributePaths = {"fonction", "chantier"})
    @Override
    Page<Employee> findAll(org.springframework.data.jpa.domain.Specification<Employee> spec, Pageable pageable);

    boolean existsByCinIgnoreCase(String cin);

    Optional<Employee> findByCinIgnoreCase(String cin);
}

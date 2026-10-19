package staport.rh.employee.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import staport.rh.employee.entities.EmployeeSortie;

import java.time.YearMonth;

@Repository
public interface EmployeeSortieRepository extends JpaRepository<EmployeeSortie, Long> {

    boolean existsByEmployee_IdAndPeriode(Long employeeId, YearMonth periode);
}

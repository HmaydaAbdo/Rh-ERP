package staport.rh.heuresupp.repositories;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import staport.rh.heuresupp.entities.HeureSupp;

import java.time.YearMonth;
import java.util.List;

public interface HeuresSuppRepository extends JpaRepository<HeureSupp, Long>, JpaSpecificationExecutor<HeureSupp> {

    boolean existsByEmployee_IdAndPeriodeAndChantier_Id(Long employeeId, YearMonth periode, Long chantierId);

    boolean existsByEmployee_IdAndPeriodeAndForfaitIsNotNullAndChantier_IdNot(Long employeeId, YearMonth periode, Long chantierId);

    long deleteByEmployee_IdAndPeriodeAndChantier_Id(Long employeeId, YearMonth periode, Long chantierId);

    List<HeureSupp> findByPeriodeAndChantier_IdOrderByEmployee_NomPrenomAsc(YearMonth periode, Long chantierId);

    List<HeureSupp> findByPeriodeOrderByEmployee_NomPrenomAsc(YearMonth periode);

    List<YearMonth> findDistinctPeriodeByOrderByPeriodeDesc();

    @Query("""
            select count(distinct h.employee.id) as employes,
                   count(h.heures) as lignesHeures,
                   coalesce(sum(h.heures), 0) as heures,
                   coalesce(sum(h.montant), 0) as montantDh,
                   coalesce(sum(h.stcDh), 0) as stcDh,
                   coalesce(sum(h.forfait), 0) as forfaitDh,
                   coalesce(sum(h.netAPayer), 0) as netAPayerDh
            from HeureSupp h where (:periode is null or h.periode = :periode)
            """)
    Object[] indicateurs(@Param("periode") YearMonth periode);

    @Query("""
            select h.chantier.id as id, h.chantier.code as code,
                   coalesce(h.chantier.nom, coalesce(h.chantier.designation, h.chantier.code)) as libelle,
                   count(h.heures) as lignesHeures, count(distinct h.employee.id) as effectif,
                   coalesce(sum(h.heures), 0) as heures, coalesce(sum(h.montant), 0) as montantDh,
                   coalesce(sum(h.stcDh), 0) as stcDh, coalesce(sum(h.forfait), 0) as forfaitDh,
                   coalesce(sum(h.netAPayer), 0) as netAPayerDh
            from HeureSupp h where (:periode is null or h.periode = :periode)
            group by h.chantier.id, h.chantier.code, h.chantier.nom, h.chantier.designation
            order by sum(h.netAPayer) desc, h.chantier.code asc
            """)
    List<HeuresSuppGroupeProjection> parChantier(@Param("periode") YearMonth periode);

    @Query("""
            select h.fonction.id as id, h.fonction.libelle as code, h.fonction.libelle as libelle,
                   count(h.heures) as lignesHeures, count(distinct h.employee.id) as effectif,
                   coalesce(sum(h.heures), 0) as heures, coalesce(sum(h.montant), 0) as montantDh,
                   coalesce(sum(h.stcDh), 0) as stcDh, coalesce(sum(h.forfait), 0) as forfaitDh,
                   coalesce(sum(h.netAPayer), 0) as netAPayerDh
            from HeureSupp h where (:periode is null or h.periode = :periode)
            group by h.fonction.id, h.fonction.libelle
            order by sum(h.netAPayer) desc, h.fonction.libelle asc
            """)
    List<HeuresSuppGroupeProjection> parFonction(@Param("periode") YearMonth periode);

    @Query("select h from HeureSupp h where h.employee.id = :employeeId and h.periode = :periode and h.forfait is not null")
    List<HeureSupp> trouverForfaits(@Param("employeeId") Long employeeId, @Param("periode") YearMonth periode);
}

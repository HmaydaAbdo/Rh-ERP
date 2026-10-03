package staport.rh.paie.entities;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import staport.rh.chantier.entities.Chantier;
import staport.rh.employee.entities.Employee;
import staport.rh.equipe.entities.Equipe;
import staport.rh.function.entities.Function;

import java.math.BigDecimal;
import java.time.YearMonth;

/**
 * Bulletin de paie d'un employé pour un mois donné (employee_id, periode) est unique : un employé
 * a au plus un bulletin par mois. fonction/chantier/equipe sont figés (snapshot) au moment de la
 * création du bulletin — ils reflètent l'affectation réelle de l'employé ce mois-là, pas son
 * affectation actuelle (Employee.fonction/chantier, qui évolue). equipe est nullable : un employé
 * peut ne pas avoir d'équipe. Un bulletin est un document
 * historique : le rattacher à l'état courant de l'employé déformerait l'historique dès que celui-ci
 * change de chantier.
 */
@Entity
@Table(
        name = "paie",
        uniqueConstraints = @UniqueConstraint(name = "uk_paie_employee_periode", columnNames = {"employee_id", "periode"}),
        indexes = {
                @Index(name = "idx_paie_employee", columnList = "employee_id"),
                @Index(name = "idx_paie_periode", columnList = "periode"),
                @Index(name = "idx_paie_chantier", columnList = "chantier_id"),
                @Index(name = "idx_paie_equipe", columnList = "equipe_id")
        }
)
public class Paie {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "employee_id", nullable = false)
    private Employee employee;

    @Column(name = "periode", nullable = false)
    private YearMonth periode;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "fonction_id", nullable = false)
    private Function fonction;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "chantier_id", nullable = false)
    private Chantier chantier;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "equipe_id")
    private Equipe equipe;

    @Column(name = "nombre_jours_travailles", nullable = false)
    private Integer nombreJoursTravailles;

    @Column(name = "jours_recuperation_ouvrable", precision = 5, scale = 2)
    private BigDecimal joursRecuperationOuvrable;

    @Column(name = "jours_recuperation_dimanche", precision = 5, scale = 2)
    private BigDecimal joursRecuperationDimanche;

    @Column(name = "salaire_mensuel", nullable = false, precision = 10, scale = 2)
    private BigDecimal salaireMensuel;

    @Column(name = "prime_roulage_ordinaire", precision = 10, scale = 2)
    private BigDecimal primeRoulageOrdinaire;

    @Column(name = "prime_roulage_dimanche", precision = 10, scale = 2)
    private BigDecimal primeRoulageDimanche;

    @Column(name = "salaire_total", nullable = false, precision = 10, scale = 2)
    private BigDecimal salaireTotal;

    @Column(name = "observation", length = 255)
    private String observation;

    public Paie() {
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Employee getEmployee() {
        return employee;
    }

    public void setEmployee(Employee employee) {
        this.employee = employee;
    }

    public YearMonth getPeriode() {
        return periode;
    }

    public void setPeriode(YearMonth periode) {
        this.periode = periode;
    }

    public Function getFonction() {
        return fonction;
    }

    public void setFonction(Function fonction) {
        this.fonction = fonction;
    }

    public Chantier getChantier() {
        return chantier;
    }

    public void setChantier(Chantier chantier) {
        this.chantier = chantier;
    }

    public Equipe getEquipe() {
        return equipe;
    }

    public void setEquipe(Equipe equipe) {
        this.equipe = equipe;
    }

    public Integer getNombreJoursTravailles() {
        return nombreJoursTravailles;
    }

    public void setNombreJoursTravailles(Integer nombreJoursTravailles) {
        this.nombreJoursTravailles = nombreJoursTravailles;
    }

    public BigDecimal getJoursRecuperationOuvrable() {
        return joursRecuperationOuvrable;
    }

    public void setJoursRecuperationOuvrable(BigDecimal joursRecuperationOuvrable) {
        this.joursRecuperationOuvrable = joursRecuperationOuvrable;
    }

    public BigDecimal getJoursRecuperationDimanche() {
        return joursRecuperationDimanche;
    }

    public void setJoursRecuperationDimanche(BigDecimal joursRecuperationDimanche) {
        this.joursRecuperationDimanche = joursRecuperationDimanche;
    }

    public BigDecimal getSalaireMensuel() {
        return salaireMensuel;
    }

    public void setSalaireMensuel(BigDecimal salaireMensuel) {
        this.salaireMensuel = salaireMensuel;
    }

    public BigDecimal getPrimeRoulageOrdinaire() {
        return primeRoulageOrdinaire;
    }

    public void setPrimeRoulageOrdinaire(BigDecimal primeRoulageOrdinaire) {
        this.primeRoulageOrdinaire = primeRoulageOrdinaire;
    }

    public BigDecimal getPrimeRoulageDimanche() {
        return primeRoulageDimanche;
    }

    public void setPrimeRoulageDimanche(BigDecimal primeRoulageDimanche) {
        this.primeRoulageDimanche = primeRoulageDimanche;
    }

    public BigDecimal getSalaireTotal() {
        return salaireTotal;
    }

    public void setSalaireTotal(BigDecimal salaireTotal) {
        this.salaireTotal = salaireTotal;
    }

    public String getObservation() {
        return observation;
    }

    public void setObservation(String observation) {
        this.observation = observation;
    }
}

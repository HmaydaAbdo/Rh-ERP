package staport.rh.employee.entities;

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
import jakarta.persistence.Version;
import org.hibernate.envers.Audited;

import java.time.YearMonth;

/**
 * Départ d'un employé de l'entreprise, constaté par la paie d'un mois : un STC dans le fichier, ou l'absence du fichier
 * confirmée par l'utilisateur. {@code motif} vaut « STC » ou le texte saisi. Un employé qui revient puis repart a plusieurs
 * départs : la table garde tout son parcours (voir docs/adr/0010-employe-etat-du-dernier-mois-de-paie.md).
 */
@Entity
@Table(
        name = "employe_sortie",
        uniqueConstraints = @UniqueConstraint(name = "uk_employe_sortie_employee_periode", columnNames = {"employee_id", "periode"}),
        indexes = @Index(name = "idx_employe_sortie_periode", columnList = "periode")
)
@Audited
public class EmployeeSortie {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "employee_id", nullable = false)
    private Employee employee;

    @Column(name = "periode", nullable = false)
    private YearMonth periode;

    @Column(name = "motif", nullable = false, length = 255)
    private String motif;

    public EmployeeSortie() {
    }

    public Long getId() {
        return id;
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

    public String getMotif() {
        return motif;
    }

    public void setMotif(String motif) {
        this.motif = motif;
    }
}

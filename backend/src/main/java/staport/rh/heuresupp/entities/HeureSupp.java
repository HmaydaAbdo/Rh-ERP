package staport.rh.heuresupp.entities;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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
import staport.rh.chantier.entities.Chantier;
import staport.rh.common.YearMonthAttributeConverter;
import staport.rh.employee.entities.Employee;
import staport.rh.employee.entities.TypeSalaire;
import staport.rh.function.entities.Function;
import staport.rh.paie.entities.Paie;

import java.math.BigDecimal;
import java.time.YearMonth;

/** Ligne mensuelle d'heures supplémentaires ou forfait, avec les valeurs de paie utilisées figées à l'import. */
@Entity
@Table(
        name = "heures_supp",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_heures_supp_employee_periode_chantier",
                columnNames = {"employee_id", "periode", "chantier_id"}),
        indexes = {
                @Index(name = "idx_heures_supp_periode", columnList = "periode"),
                @Index(name = "idx_heures_supp_chantier_periode", columnList = "chantier_id, periode"),
                @Index(name = "idx_heures_supp_employee_periode", columnList = "employee_id, periode"),
                @Index(name = "idx_heures_supp_fonction_periode", columnList = "fonction_id, periode")
        }
)
@Audited
public class HeureSupp {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "employee_id", nullable = false)
    private Employee employee;

    /** Bulletin source du mois : son existence et son observation sont vérifiées à chaque écriture. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "paie_id", nullable = false)
    private Paie paie;

    /** Fonction constatée et conservée pour le mois de l'import. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "fonction_id", nullable = false)
    private Function fonction;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "chantier_id", nullable = false)
    private Chantier chantier;

    @Convert(converter = YearMonthAttributeConverter.class)
    @Column(name = "periode", nullable = false)
    private YearMonth periode;

    /** Salaire Employee utilisé lors du calcul du taux horaire ; un changement ultérieur ne recalcule pas cette ligne. */
    @Column(name = "salaire_reference", precision = 10, scale = 2)
    private BigDecimal salaireReference;

    @Enumerated(EnumType.STRING)
    @Column(name = "type_salaire_reference", length = 20)
    private TypeSalaire typeSalaireReference;

    /** Salaire par heure, gardé à haute précision avant arrondi du Montant. */
    @Column(name = "s_h", precision = 30, scale = 20)
    private BigDecimal salaireHoraire;

    /** Nombre d'heures du mois ; null pour un employé qui reçoit uniquement un forfait. */
    @Column(name = "p_h", precision = 8, scale = 1)
    private BigDecimal heures;

    @Column(name = "montant", nullable = false, precision = 16, scale = 2)
    private BigDecimal montant;

    /** Instantané du marqueur STC/sortie dans le bulletin du même mois. */
    @Column(name = "est_stc_ou_sortie", nullable = false)
    private boolean stcOuSortie;

    @Column(name = "stc_dh", nullable = false, precision = 16, scale = 2)
    private BigDecimal stcDh;

    /** Montant libre en DH, absent quand aucun forfait n'a été saisi. */
    @Column(name = "forfait", precision = 16, scale = 2)
    private BigDecimal forfait;

    @Column(name = "net_a_payer", nullable = false, precision = 16, scale = 2)
    private BigDecimal netAPayer;

    public HeureSupp() {
    }

    public Long getId() { return id; }
    public Long getVersion() { return version; }
    public Employee getEmployee() { return employee; }
    public void setEmployee(Employee employee) { this.employee = employee; }
    public Paie getPaie() { return paie; }
    public void setPaie(Paie paie) { this.paie = paie; }
    public Function getFonction() { return fonction; }
    public void setFonction(Function fonction) { this.fonction = fonction; }
    public Chantier getChantier() { return chantier; }
    public void setChantier(Chantier chantier) { this.chantier = chantier; }
    public YearMonth getPeriode() { return periode; }
    public void setPeriode(YearMonth periode) { this.periode = periode; }
    public BigDecimal getSalaireReference() { return salaireReference; }
    public void setSalaireReference(BigDecimal salaireReference) { this.salaireReference = salaireReference; }
    public TypeSalaire getTypeSalaireReference() { return typeSalaireReference; }
    public void setTypeSalaireReference(TypeSalaire typeSalaireReference) { this.typeSalaireReference = typeSalaireReference; }
    public BigDecimal getSalaireHoraire() { return salaireHoraire; }
    public void setSalaireHoraire(BigDecimal salaireHoraire) { this.salaireHoraire = salaireHoraire; }
    public BigDecimal getHeures() { return heures; }
    public void setHeures(BigDecimal heures) { this.heures = heures; }
    public BigDecimal getMontant() { return montant; }
    public void setMontant(BigDecimal montant) { this.montant = montant; }
    public boolean isStcOuSortie() { return stcOuSortie; }
    public void setStcOuSortie(boolean stcOuSortie) { this.stcOuSortie = stcOuSortie; }
    public BigDecimal getStcDh() { return stcDh; }
    public void setStcDh(BigDecimal stcDh) { this.stcDh = stcDh; }
    public BigDecimal getForfait() { return forfait; }
    public void setForfait(BigDecimal forfait) { this.forfait = forfait; }
    public BigDecimal getNetAPayer() { return netAPayer; }
    public void setNetAPayer(BigDecimal netAPayer) { this.netAPayer = netAPayer; }
}

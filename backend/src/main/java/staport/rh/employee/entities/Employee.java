package staport.rh.employee.entities;

import jakarta.persistence.Column;
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
import jakarta.persistence.Version;
import org.hibernate.envers.Audited;
import staport.rh.chantier.entities.Chantier;
import staport.rh.function.entities.Function;

import java.time.LocalDate;

@Entity
@Table(
        name = "employe",
        indexes = {
                @Index(name = "idx_employe_fonction", columnList = "fonction_id"),
                @Index(name = "idx_employe_chantier", columnList = "chantier_id"),
                @Index(name = "idx_employe_statut", columnList = "statut"),
                @Index(name = "idx_employe_date_embauche", columnList = "date_embauche")
        }
)
@Audited
public class Employee {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    @Column(name = "nom_prenom", nullable = false, length = 150)
    private String nomPrenom;

    @Column(name = "cin", nullable = false, unique = true, length = 30)
    private String cin;

    @Column(name = "date_naissance", nullable = false)
    private LocalDate dateNaissance;

    @Column(name = "date_embauche", nullable = false)
    private LocalDate dateEmbauche;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "fonction_id", nullable = false)
    private Function fonction;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "chantier_id", nullable = false)
    private Chantier chantier;

    @Enumerated(EnumType.STRING)
    @Column(name = "statut", nullable = false, length = 20)
    private EmployeeStatut statut = EmployeeStatut.ACTIF;

    public Employee() {
    }

    public Long getId() {
        return id;
    }

    public Long getVersion() {
        return version;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getNomPrenom() {
        return nomPrenom;
    }

    public void setNomPrenom(String nomPrenom) {
        this.nomPrenom = nomPrenom;
    }

    public String getCin() {
        return cin;
    }

    public void setCin(String cin) {
        this.cin = cin;
    }

    public LocalDate getDateNaissance() {
        return dateNaissance;
    }

    public void setDateNaissance(LocalDate dateNaissance) {
        this.dateNaissance = dateNaissance;
    }

    public LocalDate getDateEmbauche() {
        return dateEmbauche;
    }

    public void setDateEmbauche(LocalDate dateEmbauche) {
        this.dateEmbauche = dateEmbauche;
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

    public EmployeeStatut getStatut() {
        return statut;
    }

    public void setStatut(EmployeeStatut statut) {
        this.statut = statut;
    }
}

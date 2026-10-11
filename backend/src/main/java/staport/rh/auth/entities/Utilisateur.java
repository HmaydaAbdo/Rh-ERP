package staport.rh.auth.entities;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.hibernate.envers.NotAudited;
import org.hibernate.envers.Audited;
import staport.rh.employee.entities.Employee;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;

/**
 * Compte de connexion applicatif — volontairement indépendant de {@link Employee} (référentiel des
 * ouvriers de chantier synchronisé depuis l'ERP), avec un lien optionnel pour les cas où un même
 * employé a aussi besoin de se connecter à l'application.
 */
@Entity
@Table(name = "utilisateur")
@Audited
public class Utilisateur {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    @Column(name = "username", nullable = false, unique = true, length = 50)
    private String username;

    @Column(name = "email", nullable = false, unique = true, length = 255)
    private String email;

    /** Jamais audité : on n'enregistre jamais un secret. Un changement de mot de passe est tracé comme événement
     * de sécurité (voir conventions/audit.md). */
    @NotAudited
    @Column(name = "mot_de_passe_hash", nullable = false, length = 255)
    private String motDePasseHash;

    @Column(name = "actif", nullable = false)
    private boolean actif = true;

    /** État opérationnel d'authentification, journalisé par événement de sécurité plutôt qu'en historique Envers. */
    @NotAudited
    @Column(name = "nombre_echecs_connexion", nullable = false)
    private int nombreEchecsConnexion;

    @NotAudited
    @Column(name = "derniere_echec_connexion")
    private Instant derniereEchecConnexion;

    @NotAudited
    @Column(name = "verrouillage_jusqua")
    private Instant verrouillageJusqua;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "employee_id")
    private Employee employee;

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
            name = "utilisateur_role",
            joinColumns = @JoinColumn(name = "utilisateur_id"),
            inverseJoinColumns = @JoinColumn(name = "role_id")
    )
    private Set<Role> roles = new HashSet<>();

    /** Deny override : permissions explicitement refusées, même si un rôle les accorde. */
    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
            name = "utilisateur_permission_refusee",
            joinColumns = @JoinColumn(name = "utilisateur_id"),
            inverseJoinColumns = @JoinColumn(name = "permission_id")
    )
    private Set<Permission> permissionsRefusees = new HashSet<>();

    public Utilisateur() {
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

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getMotDePasseHash() {
        return motDePasseHash;
    }

    public void setMotDePasseHash(String motDePasseHash) {
        this.motDePasseHash = motDePasseHash;
    }

    public boolean isActif() {
        return actif;
    }

    public void setActif(boolean actif) {
        this.actif = actif;
    }

    public int getNombreEchecsConnexion() {
        return nombreEchecsConnexion;
    }

    public void setNombreEchecsConnexion(int nombreEchecsConnexion) {
        this.nombreEchecsConnexion = nombreEchecsConnexion;
    }

    public Instant getDerniereEchecConnexion() {
        return derniereEchecConnexion;
    }

    public void setDerniereEchecConnexion(Instant derniereEchecConnexion) {
        this.derniereEchecConnexion = derniereEchecConnexion;
    }

    public Instant getVerrouillageJusqua() {
        return verrouillageJusqua;
    }

    public void setVerrouillageJusqua(Instant verrouillageJusqua) {
        this.verrouillageJusqua = verrouillageJusqua;
    }

    public Employee getEmployee() {
        return employee;
    }

    public void setEmployee(Employee employee) {
        this.employee = employee;
    }

    public Set<Role> getRoles() {
        return roles;
    }

    public void setRoles(Set<Role> roles) {
        this.roles = roles;
    }

    public Set<Permission> getPermissionsRefusees() {
        return permissionsRefusees;
    }

    public void setPermissionsRefusees(Set<Permission> permissionsRefusees) {
        this.permissionsRefusees = permissionsRefusees;
    }
}

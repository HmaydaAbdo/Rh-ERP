package staport.rh.chantier.entities;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import org.hibernate.envers.Audited;

import java.math.BigDecimal;

@Entity
@Table(
        name = "chantier",
        indexes = {
                @Index(name = "idx_chantier_actif", columnList = "actif"),
                @Index(name = "idx_chantier_source_erp", columnList = "source_erp")
        }
)
@Audited
public class Chantier {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    @Column(name = "code", nullable = false, length = 100)
    private String code;

    @Column(name = "designation", length = 500)
    private String designation;

    /**
     * Nom optionnel du chantier, distinct de {@code designation} — jamais exposé ni modifié par la
     * synchronisation ERP (voir {@code ChantierSyncTransactionalOperations}), uniquement saisi/modifié
     * manuellement. Affiché par le rapport PDF/l'export Excel de la paie sous la forme
     * "CHANTIER : &lt;nom&gt; (&lt;code&gt;)" quand renseigné (le nom prime, code en repli sinon).
     */
    @Column(name = "nom", length = 255)
    private String nom;

    @Enumerated(EnumType.STRING)
    @Column(name = "nature", length = 30)
    private NatureChantier nature;

    @Column(name = "localisation", length = 2048)
    private String localisation;

    @Column(name = "latitude", precision = 11, scale = 8)
    private BigDecimal latitude;

    @Column(name = "longitude", precision = 11, scale = 8)
    private BigDecimal longitude;

    @Column(name = "afficher_sur_carte", nullable = false)
    private boolean afficherSurCarte;

    /**
     * Vrai si ce chantier est géré par la synchronisation ERP (webServiceBS/getChantiers).
     * La réconciliation se fait par {@code code} : id_chantier côté ERP n'est pas un identifiant
     * fiable par chantier (une même valeur peut être partagée par des dizaines de chantiers).
     * Un chantier créé manuellement (source_erp = false) n'est jamais désactivé par la synchronisation.
     */
    @Column(name = "source_erp", nullable = false)
    private boolean sourceErp = false;

    @Column(name = "actif", nullable = false)
    private boolean actif = true;

    public Chantier() {
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

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getDesignation() {
        return designation;
    }

    public void setDesignation(String designation) {
        this.designation = designation;
    }

    public String getNom() {
        return nom;
    }

    public void setNom(String nom) {
        this.nom = nom;
    }

    public boolean isSourceErp() {
        return sourceErp;
    }

    public NatureChantier getNature() { return nature; }
    public void setNature(NatureChantier nature) { this.nature = nature; }
    public String getLocalisation() { return localisation; }
    public void setLocalisation(String localisation) { this.localisation = localisation; }
    public BigDecimal getLatitude() { return latitude; }
    public void setLatitude(BigDecimal latitude) { this.latitude = latitude; }
    public BigDecimal getLongitude() { return longitude; }
    public void setLongitude(BigDecimal longitude) { this.longitude = longitude; }
    public boolean isAfficherSurCarte() { return afficherSurCarte; }
    public void setAfficherSurCarte(boolean afficherSurCarte) { this.afficherSurCarte = afficherSurCarte; }

    public void setSourceErp(boolean sourceErp) {
        this.sourceErp = sourceErp;
    }

    public boolean isActif() {
        return actif;
    }

    public void setActif(boolean actif) {
        this.actif = actif;
    }
}

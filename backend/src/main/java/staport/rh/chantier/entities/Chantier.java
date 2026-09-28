package staport.rh.chantier.entities;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

@Entity
@Table(
        name = "chantier",
        indexes = {
                @Index(name = "idx_chantier_actif", columnList = "actif"),
                @Index(name = "idx_chantier_source_erp", columnList = "source_erp")
        }
)
public class Chantier {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "code", nullable = false, unique = true, length = 100)
    private String code;

    @Column(name = "designation", length = 500)
    private String designation;

    /**
     * Nom optionnel du chantier, distinct de {@code designation} — jamais exposé ni modifié par la
     * synchronisation ERP (voir {@code ChantierSyncTransactionalOperations}), uniquement saisi/modifié
     * manuellement. Affiché par le rapport PDF/l'export Excel de la paie sous la forme
     * "CHANTIER : &lt;code&gt; (&lt;nom&gt;)" quand renseigné.
     */
    @Column(name = "nom", length = 255)
    private String nom;

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

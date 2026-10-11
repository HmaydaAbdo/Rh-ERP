package staport.rh.parametre.entities;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.envers.Audited;

/**
 * Valeur courante d'un paramètre de fonctionnement. {@code cle} est le code d'une {@link CleParametre} (le catalogue :
 * libellé, type, bornes) ; {@code valeur} est stockée en texte et validée selon le type de la clé avant écriture.
 */
@Entity
@Table(name = "parametre")
@Audited
public class Parametre {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "cle", nullable = false, unique = true, length = 100)
    private String cle;

    @Column(name = "valeur", nullable = false, length = 255)
    private String valeur;

    public Parametre() {
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getCle() {
        return cle;
    }

    public void setCle(String cle) {
        this.cle = cle;
    }

    public String getValeur() {
        return valeur;
    }

    public void setValeur(String valeur) {
        this.valeur = valeur;
    }
}

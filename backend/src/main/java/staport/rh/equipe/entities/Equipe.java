package staport.rh.equipe.entities;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.hibernate.envers.Audited;

/**
 * Équipe de travail (CHAUFFEURS, OPERATEURS...) — référentiel global, partagé par tous les chantiers.
 * {@code code} est stocké normalisé (trim + majuscules, voir {@code EquipeService}) et sert de clé de
 * sélection/regroupement (import Excel, export, rapport BI) ; {@code libelle} est le nom d'affichage.
 */
@Entity
@Table(name = "equipe")
@Audited
public class Equipe {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    @Column(name = "code", nullable = false, unique = true, length = 50)
    private String code;

    @Column(name = "libelle", nullable = false, unique = true, length = 100)
    private String libelle;

    public Equipe() {
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

    public String getLibelle() {
        return libelle;
    }

    public void setLibelle(String libelle) {
        this.libelle = libelle;
    }
}

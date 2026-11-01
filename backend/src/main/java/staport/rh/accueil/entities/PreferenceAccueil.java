package staport.rh.accueil.entities;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.hibernate.envers.Audited;

/**
 * Accueil choisi pour un utilisateur : les codes des {@link IndicateurAccueil} à afficher, dans l'ordre d'affichage, séparés par
 * des virgules. Sans ligne, l'utilisateur voit tous les indicateurs que ses permissions autorisent. L'utilisateur est référencé par
 * son identifiant (clé étrangère en base) : le domaine ne dépend pas de l'entité du domaine Auth.
 */
@Entity
@Table(name = "accueil_preference")
@Audited
public class PreferenceAccueil {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    @Column(name = "utilisateur_id", nullable = false, unique = true, updatable = false)
    private Long utilisateurId;

    @Column(name = "indicateurs", nullable = false, length = 500)
    private String indicateurs;

    public PreferenceAccueil() {
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

    public Long getUtilisateurId() {
        return utilisateurId;
    }

    public void setUtilisateurId(Long utilisateurId) {
        this.utilisateurId = utilisateurId;
    }

    public String getIndicateurs() {
        return indicateurs;
    }

    public void setIndicateurs(String indicateurs) {
        this.indicateurs = indicateurs;
    }
}

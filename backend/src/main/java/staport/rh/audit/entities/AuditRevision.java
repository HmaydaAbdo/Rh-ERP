package staport.rh.audit.entities;

import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.Table;
import org.hibernate.envers.ModifiedEntityNames;
import org.hibernate.envers.RevisionEntity;
import org.hibernate.envers.RevisionNumber;
import org.hibernate.envers.RevisionTimestamp;
import staport.rh.audit.context.Origine;
import staport.rh.audit.envers.AuditRevisionListener;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;

/**
 * Révision Envers : une par transaction qui modifie au moins une entité auditée. Elle porte qui, quand, d'où
 * (voir {@link AuditRevisionListener}) ; les instantanés eux-mêmes sont dans les tables {@code <table>_aud}, qui
 * pointent ici par {@code rev}. L'identité est figée (aucune clé étrangère vers le compte) : l'historique survit au
 * compte. Jamais modifiée après son écriture.
 */
@Entity
@Table(name = "audit_revision")
@RevisionEntity(AuditRevisionListener.class)
public class AuditRevision {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @RevisionNumber
    private Long id;

    @RevisionTimestamp
    @Column(name = "horodatage", nullable = false)
    private Instant horodatage;

    @Column(name = "utilisateur_id")
    private Long utilisateurId;

    @Column(name = "utilisateur_nom", nullable = false, length = 50)
    private String utilisateurNom;

    @Enumerated(EnumType.STRING)
    @Column(name = "origine", nullable = false, length = 20)
    private Origine origine;

    @Column(name = "request_id", length = 36)
    private String requestId;

    @Column(name = "adresse_ip", length = 45)
    private String adresseIp;

    /** Types d'entités modifiés par cette révision (noms Hibernate) — retrouver vite « ce qui a changé ». */
    @ElementCollection
    @JoinTable(name = "audit_revision_entite", joinColumns = @JoinColumn(name = "revision_id"))
    @Column(name = "entite", nullable = false)
    @ModifiedEntityNames
    private Set<String> entites = new HashSet<>();

    public AuditRevision() {
    }

    public Long getId() {
        return id;
    }

    public Instant getHorodatage() {
        return horodatage;
    }

    public Long getUtilisateurId() {
        return utilisateurId;
    }

    public void setUtilisateurId(Long utilisateurId) {
        this.utilisateurId = utilisateurId;
    }

    public String getUtilisateurNom() {
        return utilisateurNom;
    }

    public void setUtilisateurNom(String utilisateurNom) {
        this.utilisateurNom = utilisateurNom;
    }

    public Origine getOrigine() {
        return origine;
    }

    public void setOrigine(Origine origine) {
        this.origine = origine;
    }

    public String getRequestId() {
        return requestId;
    }

    public void setRequestId(String requestId) {
        this.requestId = requestId;
    }

    public String getAdresseIp() {
        return adresseIp;
    }

    public void setAdresseIp(String adresseIp) {
        this.adresseIp = adresseIp;
    }

    public Set<String> getEntites() {
        return entites;
    }
}

package staport.rh.audit.entities;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import staport.rh.audit.context.Origine;

import java.time.Instant;

/**
 * Une entrée du journal d'audit unique (conventions/audit.md, « Journal d'audit ») : opération métier, événement de
 * sécurité ou sortie de données. Immuable une fois écrite — aucun setter, aucune route de modification. Se construit
 * par {@link Builder} : l'entrée porte beaucoup de champs facultatifs selon sa catégorie.
 */
@Entity
@Table(
        name = "audit_journal",
        indexes = {
                @Index(name = "idx_audit_journal_horodatage", columnList = "horodatage DESC"),
                @Index(name = "idx_audit_journal_utilisateur", columnList = "utilisateur_id, horodatage"),
                @Index(name = "idx_audit_journal_categorie_action", columnList = "categorie, action"),
                @Index(name = "idx_audit_journal_entite", columnList = "entite_type, entite_id"),
                @Index(name = "idx_audit_journal_request_id", columnList = "request_id"),
                @Index(name = "idx_audit_journal_revision", columnList = "revision_id")
        }
)
public class AuditJournalEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "horodatage", nullable = false, updatable = false)
    private Instant horodatage;

    @Enumerated(EnumType.STRING)
    @Column(name = "categorie", nullable = false, length = 20, updatable = false)
    private CategorieAudit categorie;

    @Column(name = "action", nullable = false, length = 60, updatable = false)
    private String action;

    @Enumerated(EnumType.STRING)
    @Column(name = "type_operation", length = 10, updatable = false)
    private TypeOperation typeOperation;

    @Enumerated(EnumType.STRING)
    @Column(name = "resultat", nullable = false, length = 10, updatable = false)
    private ResultatAudit resultat;

    @Column(name = "utilisateur_id", updatable = false)
    private Long utilisateurId;

    @Column(name = "utilisateur_nom", nullable = false, length = 50, updatable = false)
    private String utilisateurNom;

    @Enumerated(EnumType.STRING)
    @Column(name = "origine", nullable = false, length = 20, updatable = false)
    private Origine origine;

    @Column(name = "request_id", length = 36, updatable = false)
    private String requestId;

    @Column(name = "adresse_ip", length = 45, updatable = false)
    private String adresseIp;

    @Column(name = "user_agent", length = 255, updatable = false)
    private String userAgent;

    @Column(name = "entite_type", length = 50, updatable = false)
    private String entiteType;

    @Column(name = "entite_id", updatable = false)
    private Long entiteId;

    @Column(name = "nombre_elements", updatable = false)
    private Integer nombreElements;

    /** Description JSON d'un accès ou d'une opération : route, mois, critères non nominatifs, nom et empreinte d'un fichier… */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "perimetre", updatable = false)
    private String perimetre;

    @Column(name = "motif", length = 500, updatable = false)
    private String motif;

    /** Révision Envers produite par l'opération (instantanés avant / après), si elle a eu lieu dans une transaction. */
    @Column(name = "revision_id", updatable = false)
    private Long revisionId;

    protected AuditJournalEntry() {
    }

    private AuditJournalEntry(Builder b) {
        this.horodatage = b.horodatage;
        this.categorie = b.categorie;
        this.action = b.action;
        this.typeOperation = b.typeOperation;
        this.resultat = b.resultat;
        this.utilisateurId = b.utilisateurId;
        this.utilisateurNom = b.utilisateurNom;
        this.origine = b.origine;
        this.requestId = b.requestId;
        this.adresseIp = b.adresseIp;
        this.userAgent = b.userAgent;
        this.entiteType = b.entiteType;
        this.entiteId = b.entiteId;
        this.nombreElements = b.nombreElements;
        this.perimetre = b.perimetre;
        this.motif = b.motif;
        this.revisionId = b.revisionId;
    }

    public static Builder builder() {
        return new Builder();
    }

    public Long getId() {
        return id;
    }

    public Instant getHorodatage() {
        return horodatage;
    }

    public CategorieAudit getCategorie() {
        return categorie;
    }

    public String getAction() {
        return action;
    }

    public TypeOperation getTypeOperation() {
        return typeOperation;
    }

    public ResultatAudit getResultat() {
        return resultat;
    }

    public Long getUtilisateurId() {
        return utilisateurId;
    }

    public String getUtilisateurNom() {
        return utilisateurNom;
    }

    public Origine getOrigine() {
        return origine;
    }

    public String getRequestId() {
        return requestId;
    }

    public String getAdresseIp() {
        return adresseIp;
    }

    public String getUserAgent() {
        return userAgent;
    }

    public String getEntiteType() {
        return entiteType;
    }

    public Long getEntiteId() {
        return entiteId;
    }

    public Integer getNombreElements() {
        return nombreElements;
    }

    public String getPerimetre() {
        return perimetre;
    }

    public String getMotif() {
        return motif;
    }

    public Long getRevisionId() {
        return revisionId;
    }

    public static final class Builder {

        private Instant horodatage = Instant.now();
        private CategorieAudit categorie;
        private String action;
        private TypeOperation typeOperation;
        private ResultatAudit resultat = ResultatAudit.SUCCES;
        private Long utilisateurId;
        private String utilisateurNom;
        private Origine origine;
        private String requestId;
        private String adresseIp;
        private String userAgent;
        private String entiteType;
        private Long entiteId;
        private Integer nombreElements;
        private String perimetre;
        private String motif;
        private Long revisionId;

        private Builder() {
        }

        public Builder categorie(CategorieAudit categorie) {
            this.categorie = categorie;
            return this;
        }

        public Builder action(String action) {
            this.action = action;
            return this;
        }

        public Builder typeOperation(TypeOperation typeOperation) {
            this.typeOperation = typeOperation == TypeOperation.AUCUN ? null : typeOperation;
            return this;
        }

        public Builder resultat(ResultatAudit resultat) {
            this.resultat = resultat;
            return this;
        }

        public Builder utilisateurId(Long utilisateurId) {
            this.utilisateurId = utilisateurId;
            return this;
        }

        public Builder utilisateurNom(String utilisateurNom) {
            this.utilisateurNom = utilisateurNom;
            return this;
        }

        public Builder origine(Origine origine) {
            this.origine = origine;
            return this;
        }

        public Builder requestId(String requestId) {
            this.requestId = requestId;
            return this;
        }

        public Builder adresseIp(String adresseIp) {
            this.adresseIp = adresseIp;
            return this;
        }

        public Builder userAgent(String userAgent) {
            this.userAgent = userAgent;
            return this;
        }

        public Builder entiteType(String entiteType) {
            this.entiteType = entiteType;
            return this;
        }

        public Builder entiteId(Long entiteId) {
            this.entiteId = entiteId;
            return this;
        }

        public Builder nombreElements(Integer nombreElements) {
            this.nombreElements = nombreElements;
            return this;
        }

        public Builder perimetre(String perimetreJson) {
            this.perimetre = perimetreJson;
            return this;
        }

        public Builder motif(String motif) {
            this.motif = motif == null || motif.length() <= 500 ? motif : motif.substring(0, 500);
            return this;
        }

        public Builder revisionId(Long revisionId) {
            this.revisionId = revisionId;
            return this;
        }

        public AuditJournalEntry build() {
            return new AuditJournalEntry(this);
        }
    }
}

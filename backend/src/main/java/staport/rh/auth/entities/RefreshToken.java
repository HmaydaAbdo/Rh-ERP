package staport.rh.auth.entities;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * Refresh token opaque (jamais un JWT) — un seul usage : {@code AuthService} le fait pivoter à
 * chaque appel {@code /auth/refresh} et invalide l'ancien. Seul {@link #tokenHash} est stocké,
 * jamais le token en clair (même principe qu'un mot de passe).
 */
@Entity
@Table(name = "refresh_token")
public class RefreshToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "utilisateur_id", nullable = false)
    private Utilisateur utilisateur;

    @Column(name = "token_hash", nullable = false, unique = true, length = 255)
    private String tokenHash;

    @Column(name = "expire_le", nullable = false)
    private Instant expireLe;

    @Column(name = "revoque", nullable = false)
    private boolean revoque = false;

    @Column(name = "cree_le", nullable = false)
    private Instant creeLe = Instant.now();

    public RefreshToken() {
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Utilisateur getUtilisateur() {
        return utilisateur;
    }

    public void setUtilisateur(Utilisateur utilisateur) {
        this.utilisateur = utilisateur;
    }

    public String getTokenHash() {
        return tokenHash;
    }

    public void setTokenHash(String tokenHash) {
        this.tokenHash = tokenHash;
    }

    public Instant getExpireLe() {
        return expireLe;
    }

    public void setExpireLe(Instant expireLe) {
        this.expireLe = expireLe;
    }

    public boolean isRevoque() {
        return revoque;
    }

    public void setRevoque(boolean revoque) {
        this.revoque = revoque;
    }

    public Instant getCreeLe() {
        return creeLe;
    }

    public void setCreeLe(Instant creeLe) {
        this.creeLe = creeLe;
    }
}

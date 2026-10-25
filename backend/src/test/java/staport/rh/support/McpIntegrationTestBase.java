package staport.rh.support;

import com.nimbusds.jose.jwk.RSAKey;
import org.junit.jupiter.api.AfterEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import staport.rh.audit.support.AuditIntegrationTestBase;
import staport.rh.auth.entities.Role;
import staport.rh.auth.entities.Utilisateur;
import staport.rh.auth.repositories.PermissionRepository;
import staport.rh.auth.repositories.RoleRepository;
import staport.rh.auth.repositories.UtilisateurRepository;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Socle des tests qui exercent la route {@code /mcp} sur l'application complète et un vrai serveur HTTP. Toutes les
 * classes qui en héritent partagent <strong>un seul</strong> contexte Spring (mêmes propriétés), donc un seul pool de
 * connexions sur le PostgreSQL de test.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public abstract class McpIntegrationTestBase extends AuditIntegrationTestBase {

    protected static final RSAKey CLE_COURANTE = ClesAgentDeTest.generer("cle-courante");
    protected static final RSAKey CLE_PRECEDENTE = ClesAgentDeTest.generer("cle-precedente");

    @DynamicPropertySource
    static void activerMcp(DynamicPropertyRegistry proprietes) {
        proprietes.add("security.mcp.enabled", () -> "true");
        proprietes.add("security.mcp.private-key", () -> ClesAgentDeTest.base64Prive(CLE_COURANTE));
        proprietes.add("security.mcp.key-id", CLE_COURANTE::getKeyID);
        proprietes.add("security.mcp.previous-public-key", () -> ClesAgentDeTest.base64Public(CLE_PRECEDENTE));
        proprietes.add("security.mcp.previous-key-id", CLE_PRECEDENTE::getKeyID);
    }

    @LocalServerPort
    protected int port;
    @Autowired
    protected UtilisateurRepository utilisateurs;
    @Autowired
    protected RoleRepository roles;
    @Autowired
    protected PermissionRepository permissions;
    @Autowired
    private PasswordEncoder encodeur;

    private final List<Long> utilisateursCrees = new ArrayList<>();
    private final List<Long> rolesCrees = new ArrayList<>();

    @AfterEach
    void supprimerComptesMcp() {
        utilisateursCrees.forEach(utilisateurs::deleteById);
        rolesCrees.forEach(roles::deleteById);
        utilisateursCrees.clear();
        rolesCrees.clear();
    }

    /** Un compte portant un rôle de test avec exactement {@code codes} ; supprimé après le test. */
    protected Utilisateur creerUtilisateur(Set<String> codes, boolean actif) {
        String suffixe = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        Role role = new Role();
        role.setNom("IA-TEST-" + suffixe);
        role.setDescription("Rôle de test de l'assistant IA");
        role.setPermissions(new HashSet<>(permissions.findByCodeIn(List.copyOf(codes))));
        role = roles.saveAndFlush(role);
        rolesCrees.add(role.getId());

        Utilisateur utilisateur = new Utilisateur();
        utilisateur.setUsername("ia-" + suffixe);
        utilisateur.setEmail("ia-" + suffixe + "@example.test");
        utilisateur.setMotDePasseHash(encodeur.encode("mot-de-passe-de-test"));
        utilisateur.setActif(actif);
        utilisateur.setRoles(new HashSet<>(Set.of(role)));
        utilisateur = utilisateurs.saveAndFlush(utilisateur);
        utilisateursCrees.add(0, utilisateur.getId());
        return utilisateur;
    }
}

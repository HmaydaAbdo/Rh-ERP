package staport.rh.auth.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;
import staport.rh.auth.services.interfaces.IUserService;

/**
 * Crée le compte SYSTEM_ADMIN de bootstrap au démarrage si aucun n'existe encore en base (voir
 * conventions/security.md, "Bootstrap admin") — ne fait rien si un SYSTEM_ADMIN existe déjà.
 */
@Component
public class AdminBootstrapRunner implements CommandLineRunner {

    private final IUserService userService;
    private final String adminUsername;
    private final String adminEmail;
    private final String adminPassword;

    public AdminBootstrapRunner(IUserService userService,
                                 @Value("${security.admin.username}") String adminUsername,
                                 @Value("${security.admin.email}") String adminEmail,
                                 @Value("${security.admin.password}") String adminPassword) {
        this.userService = userService;
        this.adminUsername = adminUsername;
        this.adminEmail = adminEmail;
        this.adminPassword = adminPassword;
    }

    @Override
    public void run(String... args) {
        userService.bootstrapAdminIfMissing(adminUsername, adminEmail, adminPassword);
    }
}

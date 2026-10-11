package staport.rh.audit.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/**
 * Fixe l'ordre de l'intercepteur transactionnel (par défaut le plus interne possible) pour qu'il enveloppe
 * {@code GenericAuditAspect} — voir {@link OrdreIntercepteurs}. Cette déclaration remplace celle de Spring Boot
 * (qui s'efface dès qu'une configuration de gestion transactionnelle existe) : {@code proxyTargetClass} reprend sa valeur.
 */
@Configuration
@EnableScheduling
@EnableTransactionManagement(proxyTargetClass = true, order = OrdreIntercepteurs.TRANSACTION)
public class AuditConfig {
}

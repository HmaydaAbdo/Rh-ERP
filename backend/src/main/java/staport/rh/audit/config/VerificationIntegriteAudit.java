package staport.rh.audit.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import staport.rh.audit.metrics.AuditMetrics;

import java.util.List;

/**
 * Vérifie au démarrage que le compte avec lequel l'application est connectée ne peut pas modifier une table d'audit
 * (conventions/audit.md, « Intégrité ») : un audit que l'application peut réécrire n'est pas opposable. Si ce n'est pas
 * le cas, un {@code WARN} explicite et la jauge {@code rh.audit.integrite.compromise} (valeur 1) le signalent — sans
 * empêcher le démarrage : en développement et en CI, un seul compte sert à tout, c'est attendu.
 */
@Component
public class VerificationIntegriteAudit implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(VerificationIntegriteAudit.class);

    private static final String TABLES_MODIFIABLES = """
            SELECT c.relname
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = current_schema() AND c.relkind = 'r'
              AND (c.relname LIKE 'audit\\_%' OR c.relname LIKE '%\\_aud')
              AND (has_table_privilege(current_user, c.oid, 'UPDATE')
                   OR has_table_privilege(current_user, c.oid, 'DELETE')
                   OR has_table_privilege(current_user, c.oid, 'TRUNCATE'))
            ORDER BY c.relname""";

    private final JdbcTemplate jdbc;
    private final AuditMetrics metriques;

    public VerificationIntegriteAudit(JdbcTemplate jdbc, AuditMetrics metriques) {
        this.jdbc = jdbc;
        this.metriques = metriques;
    }

    @Override
    public void run(ApplicationArguments args) {
        List<String> modifiables = jdbc.queryForList(TABLES_MODIFIABLES, String.class);
        metriques.integriteCompromise(!modifiables.isEmpty());
        if (modifiables.isEmpty()) {
            log.info("Intégrité de l'audit : le compte applicatif ne peut pas modifier les tables d'audit");
        } else {
            log.warn("Intégrité de l'audit NON garantie : le compte applicatif peut modifier {} table(s) d'audit {}. "
                    + "Normal en développement avec un seul compte PostgreSQL ; en production, utiliser deux comptes "
                    + "(DB_MIGRATION_USER pour Flyway, DB_USER pour l'application — conventions/deployment.md).",
                    modifiables.size(), modifiables);
        }
    }
}

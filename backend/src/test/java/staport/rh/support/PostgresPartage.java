package staport.rh.support;

import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Le PostgreSQL des tests d'intégration (conventions Staport, « Stratégie de tests ») : un conteneur {@code pgvector/pgvector:pg18}
 * — la version et l'extension de la production —, démarré une seule fois pour toute la JVM de test et jeté à la fin (Ryuk).
 * Les coordonnées sont publiées comme propriétés système sous les noms des variables d'environnement de l'application
 * ({@code DB_HOST}, {@code DB_USER}…) : elles priment sur l'environnement, et {@code application.yml} les résout sans
 * qu'aucun test n'ait à connaître le conteneur. Un seul compte (propriétaire et applicatif) : {@code afterMigrate.sql} ne
 * restreint alors rien, comme en développement.
 */
final class PostgresPartage {

    private static final String BASE = "ci_test";
    private static final String COMPTE = "ci_test";
    private static final String MOT_DE_PASSE = "ci_test";

    private static PostgreSQLContainer conteneur;

    private PostgresPartage() {
    }

    static synchronized void demarrer() {
        if (conteneur != null) {
            return;
        }
        conteneur = new PostgreSQLContainer("pgvector/pgvector:pg18")
                .withDatabaseName(BASE)
                .withUsername(COMPTE)
                .withPassword(MOT_DE_PASSE);
        conteneur.start();
        System.setProperty("DB_HOST", conteneur.getHost());
        System.setProperty("DB_PORT", String.valueOf(conteneur.getMappedPort(PostgreSQLContainer.POSTGRESQL_PORT)));
        System.setProperty("DB_NAME", BASE);
        System.setProperty("DB_USER", COMPTE);
        System.setProperty("DB_PASSWORD", MOT_DE_PASSE);
        System.setProperty("DB_MIGRATION_USER", COMPTE);
        System.setProperty("DB_MIGRATION_PASSWORD", MOT_DE_PASSE);
    }
}

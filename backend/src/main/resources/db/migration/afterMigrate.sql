-- Droits du compte applicatif, recalculés après CHAQUE migration (rappel Flyway « afterMigrate », idempotent) : un rappel
-- plutôt qu'une migration, pour couvrir aussi les tables créées plus tard. Voir conventions/audit.md (« Intégrité »),
-- conventions/deployment.md (« Deux comptes PostgreSQL ») et docs/audit/README.md.
--
-- Flyway s'exécute avec le compte PROPRIÉTAIRE du schéma ; l'application avec le compte APPLICATIF (${app_user}). Sans
-- cette séparation un REVOKE serait cosmétique : le propriétaire peut tout. Le compte applicatif a :
--   * SELECT, INSERT, UPDATE, DELETE sur les tables métier ;
--   * SELECT, INSERT seulement sur les tables d'audit (audit_* et *_aud) : il ne peut ni réécrire, ni effacer l'historique ;
--   * SELECT seulement sur l'historique de Flyway.
--
-- Quand le compte applicatif EST le propriétaire (développement, CI), il n'y a rien à restreindre : le script ne fait rien
-- et l'application le signale au démarrage (VerificationIntegriteAudit). Sinon, le compte applicatif est créé s'il
-- n'existe pas — son mot de passe vient de l'environnement (variable DB_PASSWORD), jamais d'un fichier versionné ; il ne
-- doit donc pas contenir d'apostrophe (il est inséré tel quel entre apostrophes par Flyway).
-- Cette callback Flyway injecte le secret applicatif dans le bloc qui crée le rôle. Conserver la trace pgAudit de
-- l'opération (classe, commande, objet, acteur), mais masquer le texte SQL pour ce seul bloc afin de ne pas journaliser
-- le secret substitué par Flyway. Les classes restent actives ; le réglage est restauré après le bloc.
SET pgaudit.log_statement = off;

DO $$
DECLARE
    v_app   TEXT := '${app_user}';
    v_mdp   TEXT := '${app_password}';
    v_table RECORD;
BEGIN
    IF v_app = current_user THEN
        RAISE NOTICE 'Compte applicatif identique au propriétaire (%) : aucun droit à restreindre.', v_app;
        RETURN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_app) THEN
        EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', v_app, v_mdp);
    END IF;

    EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), v_app);
    EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', v_app);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', v_app);
    EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', v_app);

    FOR v_table IN
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND (tablename LIKE 'audit\_%' OR tablename LIKE '%\_aud')
    LOOP
        EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON %I FROM %I', v_table.tablename, v_app);
    END LOOP;

    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON flyway_schema_history FROM %I', v_app);
END $$;

RESET pgaudit.log_statement;

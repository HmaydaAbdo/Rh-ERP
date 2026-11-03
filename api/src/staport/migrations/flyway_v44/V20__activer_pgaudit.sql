-- Le développement et les tests gardent l'image PostgreSQL standard. La production active cette migration
-- explicitement après avoir démarré l'image ERP-RH PostgreSQL qui précharge pgAudit. Le réglage ALTER DATABASE
-- limite volontairement pgAudit à la base ERP-RH ; il ne s'applique pas aux autres bases du cluster.
DO $$
BEGIN
    IF ${pgaudit_enabled} THEN
        CREATE EXTENSION IF NOT EXISTS pgaudit;
        -- Tracer toutes les classes pgAudit, y compris ROLE (CREATE/ALTER/DROP ROLE, GRANT/REVOKE).
        EXECUTE format('ALTER DATABASE %I SET pgaudit.log = %L', current_database(), 'all');
        EXECUTE format('ALTER DATABASE %I SET pgaudit.log_parameter = %L', current_database(), 'off');
        EXECUTE format('ALTER DATABASE %I SET pgaudit.log_statement_once = %L', current_database(), 'on');
    ELSE
        RAISE NOTICE 'pgAudit non activé pour cet environnement (PGAUDIT_ENABLED=false)';
    END IF;
END $$;

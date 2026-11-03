-- Permission de lecture de l'audit (journal et historique des enregistrements), attribuée au seul rôle SYSTEM_ADMIN
-- à l'installation (décision RH du 2026-10-04) ; administrable ensuite depuis l'écran Rôles. Voir
-- conventions/audit.md, « Consultation », et docs/rbac/audit.md.
--
-- Cette migration précède V14 (état initial de l'audit) : la permission et son attribution sont donc déjà dans
-- l'instantané initial, et n'ont pas besoin d'écrire leur propre audit (conventions/database.md, « Migrations qui
-- modifient des données auditées »).
INSERT INTO permission (code, description) VALUES
    ('AUDIT_READ', 'Consulter le journal d''audit et l''historique des enregistrements');

INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM role r
CROSS JOIN permission p
WHERE r.nom = 'SYSTEM_ADMIN'
  AND p.code = 'AUDIT_READ';

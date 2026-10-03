-- Permissions du domaine Équipe, attribuées comme les permissions CHANTIER_* (voir V4) : tous les
-- rôles qui portent déjà CHANTIER_READ/WRITE/DELETE reçoivent l'équivalent EQUIPE_* — pas de
-- permission de synchronisation, le référentiel Équipe n'a pas de source externe.
INSERT INTO permission (code, description) VALUES
    ('EQUIPE_READ',   'Consulter le référentiel des équipes'),
    ('EQUIPE_WRITE',  'Créer/modifier une équipe'),
    ('EQUIPE_DELETE', 'Supprimer une équipe');

INSERT INTO role_permission (role_id, permission_id)
SELECT rp.role_id, pe.id
FROM role_permission rp
JOIN permission pc ON pc.id = rp.permission_id
JOIN permission pe ON pe.code = REPLACE(pc.code, 'CHANTIER_', 'EQUIPE_')
WHERE pc.code IN ('CHANTIER_READ', 'CHANTIER_WRITE', 'CHANTIER_DELETE');

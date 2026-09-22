-- Catalogue fixe des permissions (une ligne par domaine x action) et rôles de départ.
-- Décision (HMAYDA, 2026-09-22) : pour cette v2, SYSTEM_ADMIN et PAIE_MANAGER ont tous les deux
-- accès à tout le périmètre applicatif actuel — seul SYSTEM_ADMIN a en plus USER_MANAGE/ROLE_MANAGE
-- (gestion des comptes/rôles). D'autres rôles plus fins seront créés via l'UI le moment venu.
-- DELETE est une permission comme les autres (pas un rôle codé en dur) — voir conventions/security.md.

INSERT INTO permission (code, description) VALUES
    ('CHANTIER_READ',   'Consulter le référentiel chantiers'),
    ('CHANTIER_WRITE',  'Créer/modifier un chantier'),
    ('CHANTIER_DELETE', 'Supprimer un chantier'),
    ('CHANTIER_SYNC',   'Déclencher la synchronisation ERP des chantiers'),

    ('EMPLOYEE_READ',   'Consulter les employés'),
    ('EMPLOYEE_WRITE',  'Créer/modifier un employé'),
    ('EMPLOYEE_DELETE', 'Supprimer un employé'),
    ('EMPLOYEE_IMPORT', 'Importer des employés depuis un fichier Excel'),

    ('FUNCTION_READ',   'Consulter le référentiel des fonctions'),
    ('FUNCTION_WRITE',  'Créer/modifier une fonction'),
    ('FUNCTION_DELETE', 'Supprimer une fonction'),
    ('FUNCTION_IMPORT', 'Importer des fonctions depuis un fichier Excel'),

    ('PAIE_READ',       'Consulter les bulletins de paie'),
    ('PAIE_WRITE',      'Créer/modifier un bulletin de paie'),
    ('PAIE_DELETE',     'Supprimer un bulletin de paie'),
    ('PAIE_IMPORT',     'Importer des bulletins de paie depuis un fichier Excel'),
    ('PAIE_EXPORT',     'Exporter les bulletins de paie au format Excel'),

    ('USER_MANAGE',     'Gérer les comptes utilisateurs (création, rôles, deny overrides)'),
    ('ROLE_MANAGE',     'Gérer les rôles et leurs permissions');

INSERT INTO role (nom, description) VALUES
    ('SYSTEM_ADMIN',  'Accès complet, y compris gestion des comptes et des rôles'),
    ('PAIE_MANAGER',  'Accès complet aux domaines métier (hors gestion des comptes/rôles)');

INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM role r
CROSS JOIN permission p
WHERE r.nom = 'SYSTEM_ADMIN';

INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM role r
CROSS JOIN permission p
WHERE r.nom = 'PAIE_MANAGER'
  AND p.code NOT IN ('USER_MANAGE', 'ROLE_MANAGE');

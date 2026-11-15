-- Séparation des pouvoirs sur la suppression : PAIE_DELETE ne couvre plus que le bulletin à l'unité ; la suppression en
-- groupe (un mois, un chantier ou une équipe d'un coup) exige PAIE_PURGE.
--
-- Attribution à l'installation : SYSTEM_ADMIN (il porte toutes les permissions) et chaque rôle qui détient PAIE_DELETE
-- aujourd'hui — rien ne change pour les comptes existants, la séparation se fait ensuite depuis l'écran Rôles en
-- retirant PAIE_PURGE aux rôles qui ne doivent pas supprimer en masse.
--
-- La migration modifie des tables auditées (permission, role, role_permission) : elle écrit sa révision, ses lignes
-- d'audit et son entrée de journal avec le gabarit de conventions/database.md.
DO $$
DECLARE
    v_rev     BIGINT;
    v_perm    BIGINT;
    v_roles   INTEGER;
BEGIN
    INSERT INTO audit_revision (horodatage, utilisateur_id, utilisateur_nom, origine, request_id, adresse_ip)
    VALUES (now(), NULL, 'Système', 'MIGRATION', gen_random_uuid()::text, NULL)
    RETURNING id INTO v_rev;

    -- La permission (revtype 0 : ajout, état après).
    WITH ajoutee AS (
        INSERT INTO permission (code, description)
        VALUES ('PAIE_PURGE', 'Supprimer en groupe des bulletins de paie (un mois, un chantier ou une équipe d''un coup)')
        RETURNING *
    )
    INSERT INTO permission_aud (id, rev, revtype, code, description)
    SELECT id, v_rev, 0, code, description FROM ajoutee;
    SELECT id INTO v_perm FROM permission WHERE code = 'PAIE_PURGE';

    -- Son attribution : SYSTEM_ADMIN et les rôles qui ont PAIE_DELETE. Une liaison ajoutée s'audite au nom du rôle
    -- propriétaire de la collection : la ligne de liaison (revtype 0) et la ligne du rôle (revtype 1).
    CREATE TEMPORARY TABLE roles_concernes ON COMMIT DROP AS
    SELECT DISTINCT r.id, r.nom, r.description
    FROM role r
    WHERE r.nom = 'SYSTEM_ADMIN'
       OR EXISTS (SELECT 1 FROM role_permission rp JOIN permission p ON p.id = rp.permission_id
                  WHERE rp.role_id = r.id AND p.code = 'PAIE_DELETE');

    INSERT INTO role_permission (role_id, permission_id) SELECT id, v_perm FROM roles_concernes;
    INSERT INTO role_permission_aud (rev, revtype, role_id, permission_id) SELECT v_rev, 0, id, v_perm FROM roles_concernes;
    INSERT INTO role_aud (id, rev, revtype, nom, description) SELECT id, v_rev, 1, nom, description FROM roles_concernes;
    SELECT count(*) INTO v_roles FROM roles_concernes;

    INSERT INTO audit_revision_entite (revision_id, entite) VALUES
        (v_rev, 'staport.rh.auth.entities.Permission'),
        (v_rev, 'staport.rh.auth.entities.Role');

    INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                               request_id, nombre_elements, perimetre, revision_id)
    SELECT now(), 'OPERATION', 'PERMISSION_CREATION', 'CREATE', 'SUCCES', 'Système', 'MIGRATION',
           request_id, 1 + v_roles,
           jsonb_build_object('migration', 'V15__permission_paie_purge', 'permission', 'PAIE_PURGE', 'rolesAttribues', v_roles),
           id
    FROM audit_revision WHERE id = v_rev;
END $$;

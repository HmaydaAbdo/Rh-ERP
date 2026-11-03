-- La restauration d'un groupe de paie est une capacité distincte de sa suppression et de la lecture de l'audit.
-- Seul SYSTEM_ADMIN reçoit PAIE_RESTORE à l'installation ; les autres attributions restent administrables dans l'écran Rôles.
-- La migration modifie des tables auditées (permission et role_permission) et consigne les révisions correspondantes.
DO $$
DECLARE
    v_rev   BIGINT;
    v_perm  BIGINT;
    v_role  BIGINT;
    v_nom   VARCHAR(100);
    v_desc  VARCHAR(255);
    v_elements INTEGER;
BEGIN
    INSERT INTO audit_revision (horodatage, utilisateur_id, utilisateur_nom, origine, request_id, adresse_ip)
    VALUES (now(), NULL, 'Système', 'MIGRATION', gen_random_uuid()::text, NULL)
    RETURNING id INTO v_rev;

    WITH ajoutee AS (
        INSERT INTO permission (code, description)
        VALUES ('PAIE_RESTORE', 'Restaurer un groupe de bulletins depuis le journal d''audit')
        RETURNING *
    )
    INSERT INTO permission_aud (id, rev, revtype, code, description)
    SELECT id, v_rev, 0, code, description FROM ajoutee;
    SELECT id INTO v_perm FROM permission WHERE code = 'PAIE_RESTORE';

    SELECT id, nom, description INTO v_role, v_nom, v_desc FROM role WHERE nom = 'SYSTEM_ADMIN';
    IF v_role IS NOT NULL THEN
        INSERT INTO role_permission (role_id, permission_id) VALUES (v_role, v_perm);
        INSERT INTO role_permission_aud (rev, revtype, role_id, permission_id) VALUES (v_rev, 0, v_role, v_perm);
        INSERT INTO role_aud (id, rev, revtype, nom, description) VALUES (v_role, v_rev, 1, v_nom, v_desc);
        v_elements := 2;
    ELSE
        v_elements := 1;
    END IF;

    INSERT INTO audit_revision_entite (revision_id, entite) VALUES
        (v_rev, 'staport.rh.auth.entities.Permission'),
        (v_rev, 'staport.rh.auth.entities.Role');

    INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                               request_id, nombre_elements, perimetre, revision_id)
    SELECT now(), 'OPERATION', 'PERMISSION_CREATION', 'CREATE', 'SUCCES', 'Système', 'MIGRATION', request_id,
           v_elements, jsonb_build_object('migration', 'V17__permission_paie_restore', 'permission', 'PAIE_RESTORE',
                                'rolesAttribues', CASE WHEN v_role IS NULL THEN 0 ELSE 1 END), id
    FROM audit_revision WHERE id = v_rev;
END $$;

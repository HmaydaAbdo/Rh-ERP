-- Import Excel du référentiel Équipe. Le nouveau droit suit les rôles autorisés à administrer
-- le référentiel (EQUIPE_WRITE). Permission et attributions sont auditées comme les autres
-- changements du catalogue RBAC.
DO $$
DECLARE
    v_rev BIGINT;
    v_perm BIGINT;
    v_count INTEGER := 0;
BEGIN
    INSERT INTO audit_revision (horodatage, utilisateur_id, utilisateur_nom, origine, request_id, adresse_ip)
    VALUES (now(), NULL, 'Système', 'MIGRATION', gen_random_uuid()::text, NULL)
    RETURNING id INTO v_rev;

    WITH ajoutee AS (
        INSERT INTO permission (code, description)
        VALUES ('EQUIPE_IMPORT', 'Importer des équipes depuis un fichier Excel')
        RETURNING *
    )
    INSERT INTO permission_aud (id, rev, revtype, code, description)
    SELECT id, v_rev, 0, code, description FROM ajoutee;
    SELECT id INTO v_perm FROM permission WHERE code = 'EQUIPE_IMPORT';

    WITH roles_concernes AS (
        SELECT DISTINCT rp.role_id
        FROM role_permission rp
        JOIN permission p ON p.id = rp.permission_id
        WHERE p.code = 'EQUIPE_WRITE'
    ), ajouts AS (
        INSERT INTO role_permission (role_id, permission_id)
        SELECT rc.role_id, v_perm FROM roles_concernes rc
        RETURNING role_id, permission_id
    )
    INSERT INTO role_permission_aud (rev, revtype, role_id, permission_id)
    SELECT v_rev, 0, role_id, permission_id FROM ajouts;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    INSERT INTO audit_revision_entite (revision_id, entite) VALUES
        (v_rev, 'staport.rh.auth.entities.Permission');
    IF v_count > 0 THEN
        INSERT INTO audit_revision_entite (revision_id, entite)
        VALUES (v_rev, 'staport.rh.auth.entities.Role');
    END IF;

    INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                               request_id, nombre_elements, perimetre, revision_id)
    SELECT now(), 'OPERATION', 'PERMISSION_CREATION', 'CREATE', 'SUCCES', 'Système', 'MIGRATION', request_id,
           1 + v_count,
           jsonb_build_object('migration', 'V32__permission_equipe_import', 'permission', 'EQUIPE_IMPORT',
                              'rolesAttribues', v_count), id
    FROM audit_revision WHERE id = v_rev;
END $$;

-- Le rôle PAIE_MANAGER reçoit les droits du nouveau domaine métier, selon le seed des autres modules.
-- Permissions, attributions et révisions des rôles concernés sont auditées dans cette migration.
DO $$
DECLARE
    v_rev BIGINT;
    v_permissions INTEGER := 0;
    v_attributions INTEGER := 0;
BEGIN
    INSERT INTO audit_revision (horodatage, utilisateur_id, utilisateur_nom, origine, request_id, adresse_ip)
    VALUES (now(), NULL, 'Système', 'MIGRATION', gen_random_uuid()::text, NULL)
    RETURNING id INTO v_rev;

    WITH ajoutees AS (
        INSERT INTO permission (code, description) VALUES
            ('HEURES_SUP_READ', 'Consulter les heures supplémentaires, montants, STC et forfaits'),
            ('HEURES_SUP_IMPORT', 'Importer les heures supplémentaires et saisir les forfaits')
        RETURNING *
    )
    INSERT INTO permission_aud (id, rev, revtype, code, description)
    SELECT id, v_rev, 0, code, description FROM ajoutees;
    GET DIAGNOSTICS v_permissions = ROW_COUNT;

    WITH roles_concernes AS (
        SELECT id, nom, description FROM role WHERE nom IN ('SYSTEM_ADMIN', 'PAIE_MANAGER')
    ), attributions AS (
        INSERT INTO role_permission (role_id, permission_id)
        SELECT r.id, p.id
        FROM roles_concernes r CROSS JOIN permission p
        WHERE p.code IN ('HEURES_SUP_READ', 'HEURES_SUP_IMPORT')
        ON CONFLICT DO NOTHING
        RETURNING role_id, permission_id
    )
    INSERT INTO role_permission_aud (rev, revtype, role_id, permission_id)
    SELECT v_rev, 0, role_id, permission_id FROM attributions;
    GET DIAGNOSTICS v_attributions = ROW_COUNT;

    INSERT INTO role_aud (id, rev, revtype, nom, description)
    SELECT DISTINCT r.id, v_rev, 1, r.nom, r.description
    FROM role r
    JOIN role_permission_aud rpa ON rpa.role_id = r.id AND rpa.rev = v_rev;

    IF v_permissions > 0 THEN
        INSERT INTO audit_revision_entite (revision_id, entite)
        VALUES (v_rev, 'staport.rh.auth.entities.Permission');
    END IF;
    IF v_attributions > 0 THEN
        INSERT INTO audit_revision_entite (revision_id, entite)
        VALUES (v_rev, 'staport.rh.auth.entities.Role');
    END IF;

    INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                               request_id, nombre_elements, perimetre, revision_id)
    SELECT now(), 'OPERATION', 'PERMISSION_CREATION', 'CREATE', 'SUCCES', 'Système', 'MIGRATION', request_id,
           v_permissions + v_attributions,
           jsonb_build_object('migration', 'V40__permissions_heures_supp',
                              'permissions', jsonb_build_array('HEURES_SUP_READ', 'HEURES_SUP_IMPORT'),
                              'attributions', v_attributions), id
    FROM audit_revision WHERE id = v_rev;
END $$;

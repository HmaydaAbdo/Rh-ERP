DO $$
DECLARE
    v_rev BIGINT;
BEGIN
    INSERT INTO audit_revision (horodatage, utilisateur_id, utilisateur_nom, origine, request_id, adresse_ip)
    VALUES (now(), NULL, 'Système', 'MIGRATION', gen_random_uuid()::text, NULL)
    RETURNING id INTO v_rev;

    WITH ajoutees AS (
        INSERT INTO permission (code, description) VALUES
            ('HEURES_SUP_DELETE', 'Supprimer une ligne d’heures supplémentaires'),
            ('HEURES_SUP_PURGE', 'Supprimer en groupe les heures supplémentaires d’un mois')
        RETURNING *
    )
    INSERT INTO permission_aud (id, rev, revtype, code, description)
    SELECT id, v_rev, 0, code, description FROM ajoutees;

    WITH roles_concernes AS (
        SELECT id, nom, description FROM role WHERE nom IN ('SYSTEM_ADMIN', 'PAIE_MANAGER')
    ), attributions AS (
        INSERT INTO role_permission (role_id, permission_id)
        SELECT r.id, p.id FROM roles_concernes r CROSS JOIN permission p
        WHERE p.code IN ('HEURES_SUP_DELETE', 'HEURES_SUP_PURGE')
        ON CONFLICT DO NOTHING
        RETURNING role_id, permission_id
    )
    INSERT INTO role_permission_aud (rev, revtype, role_id, permission_id)
    SELECT v_rev, 0, role_id, permission_id FROM attributions;

    INSERT INTO role_aud (id, rev, revtype, nom, description)
    SELECT DISTINCT r.id, v_rev, 1, r.nom, r.description
    FROM role r JOIN role_permission_aud rpa ON rpa.role_id = r.id AND rpa.rev = v_rev;

    INSERT INTO audit_revision_entite (revision_id, entite)
    VALUES (v_rev, 'staport.rh.auth.entities.Permission'), (v_rev, 'staport.rh.auth.entities.Role');

    INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                               request_id, nombre_elements, perimetre, revision_id)
    SELECT now(), 'OPERATION', 'PERMISSION_CREATION', 'CREATE', 'SUCCES', 'Système', 'MIGRATION', request_id,
           2, jsonb_build_object('migration', 'V41__permissions_suppression_heures_supp',
                                 'permissions', jsonb_build_array('HEURES_SUP_DELETE', 'HEURES_SUP_PURGE')),
           id FROM audit_revision WHERE id = v_rev;
END $$;

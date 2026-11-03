-- Carte des chantiers : la permission CARTE_READ et le rôle DIRECTION (Président et directeurs).
-- Décision (HMAYDA, 2026-10-18) : CARTE_READ est attribuée à SYSTEM_ADMIN et au nouveau rôle DIRECTION, pas à PAIE_MANAGER.
-- DIRECTION ne porte que CARTE_READ à l'installation ; ses autres attributions restent administrables dans l'écran Rôles.
-- Si un rôle DIRECTION existe déjà (créé depuis l'écran Rôles), il est conservé tel quel et reçoit seulement CARTE_READ :
-- la migration ne doit jamais empêcher le démarrage de l'application.
-- La migration modifie des tables auditées (permission, role, role_permission) et consigne les révisions correspondantes.
DO $$
DECLARE
    v_rev      BIGINT;
    v_perm     BIGINT;
    v_dir      BIGINT;
    v_dir_nom  VARCHAR(50);
    v_dir_desc VARCHAR(255);
    v_dir_cree BOOLEAN;
    v_admin    BIGINT;
    v_adm_nom  VARCHAR(50);
    v_adm_desc VARCHAR(255);
    v_attributions INTEGER := 1;
BEGIN
    INSERT INTO audit_revision (horodatage, utilisateur_id, utilisateur_nom, origine, request_id, adresse_ip)
    VALUES (now(), NULL, 'Système', 'MIGRATION', gen_random_uuid()::text, NULL)
    RETURNING id INTO v_rev;

    WITH ajoutee AS (
        INSERT INTO permission (code, description)
        VALUES ('CARTE_READ', 'Consulter la carte des chantiers')
        RETURNING *
    )
    INSERT INTO permission_aud (id, rev, revtype, code, description)
    SELECT id, v_rev, 0, code, description FROM ajoutee;
    SELECT id INTO v_perm FROM permission WHERE code = 'CARTE_READ';

    -- Rôle DIRECTION : créé, ou repris s'il existe déjà (même comparaison que l'unicité des noms, V27).
    SELECT id, nom, description INTO v_dir, v_dir_nom, v_dir_desc FROM role WHERE UPPER(BTRIM(nom)) = 'DIRECTION';
    v_dir_cree := v_dir IS NULL;
    IF v_dir_cree THEN
        WITH ajoute AS (
            INSERT INTO role (nom, description)
            VALUES ('DIRECTION', 'Président et directeurs : consultation de la carte des chantiers')
            RETURNING *
        )
        INSERT INTO role_aud (id, rev, revtype, nom, description)
        SELECT id, v_rev, 0, nom, description FROM ajoute;
        SELECT id INTO v_dir FROM role WHERE nom = 'DIRECTION';
    ELSE
        INSERT INTO role_aud (id, rev, revtype, nom, description) VALUES (v_dir, v_rev, 1, v_dir_nom, v_dir_desc);
    END IF;
    INSERT INTO role_permission (role_id, permission_id) VALUES (v_dir, v_perm);
    INSERT INTO role_permission_aud (rev, revtype, role_id, permission_id) VALUES (v_rev, 0, v_dir, v_perm);

    SELECT id, nom, description INTO v_admin, v_adm_nom, v_adm_desc FROM role WHERE nom = 'SYSTEM_ADMIN';
    IF v_admin IS NOT NULL THEN
        INSERT INTO role_permission (role_id, permission_id) VALUES (v_admin, v_perm);
        INSERT INTO role_permission_aud (rev, revtype, role_id, permission_id) VALUES (v_rev, 0, v_admin, v_perm);
        INSERT INTO role_aud (id, rev, revtype, nom, description) VALUES (v_admin, v_rev, 1, v_adm_nom, v_adm_desc);
        v_attributions := 2;
    END IF;

    INSERT INTO audit_revision_entite (revision_id, entite) VALUES
        (v_rev, 'staport.rh.auth.entities.Permission'),
        (v_rev, 'staport.rh.auth.entities.Role');

    INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                               request_id, nombre_elements, perimetre, revision_id)
    SELECT now(), 'OPERATION', 'PERMISSION_CREATION', 'CREATE', 'SUCCES', 'Système', 'MIGRATION', request_id,
           1 + v_attributions, jsonb_build_object('migration', 'V28__carte_chantiers_permission_et_role',
                                                  'permission', 'CARTE_READ', 'rolesAttribues', v_attributions), id
    FROM audit_revision WHERE id = v_rev;

    IF v_dir_cree THEN
        INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                                   request_id, nombre_elements, perimetre, revision_id)
        SELECT now(), 'OPERATION', 'ROLE_CREATION', 'CREATE', 'SUCCES', 'Système', 'MIGRATION', request_id,
               1, jsonb_build_object('migration', 'V28__carte_chantiers_permission_et_role', 'role', 'DIRECTION'), id
        FROM audit_revision WHERE id = v_rev;
    END IF;
END $$;

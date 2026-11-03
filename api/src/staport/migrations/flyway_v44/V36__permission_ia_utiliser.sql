-- Assistant IA (docs/ia.md, § 5) : la permission IA_UTILISER autorise un compte à obtenir le jeton délégué de l'agent
-- et à faire appeler les outils MCP en son nom. Décision du propriétaire (2026-10-25) : attribuée d'abord à SYSTEM_ADMIN
-- seulement ; l'ouverture aux autres rôles se fait dans l'écran Rôles, au rythme du pilote.
-- La migration modifie des tables auditées (permission, role, role_permission) et consigne les révisions correspondantes.
DO $$
DECLARE
    v_rev      BIGINT;
    v_perm     BIGINT;
    v_admin    BIGINT;
    v_adm_nom  VARCHAR(50);
    v_adm_desc VARCHAR(255);
    v_attributions INTEGER := 0;
BEGIN
    INSERT INTO audit_revision (horodatage, utilisateur_id, utilisateur_nom, origine, request_id, adresse_ip)
    VALUES (now(), NULL, 'Système', 'MIGRATION', gen_random_uuid()::text, NULL)
    RETURNING id INTO v_rev;

    WITH ajoutee AS (
        INSERT INTO permission (code, description)
        VALUES ('IA_UTILISER', 'Utiliser l''assistant IA (jeton délégué et outils MCP)')
        RETURNING *
    )
    INSERT INTO permission_aud (id, rev, revtype, code, description)
    SELECT id, v_rev, 0, code, description FROM ajoutee;
    SELECT id INTO v_perm FROM permission WHERE code = 'IA_UTILISER';

    SELECT id, nom, description INTO v_admin, v_adm_nom, v_adm_desc FROM role WHERE nom = 'SYSTEM_ADMIN';
    IF v_admin IS NOT NULL THEN
        INSERT INTO role_permission (role_id, permission_id) VALUES (v_admin, v_perm);
        INSERT INTO role_permission_aud (rev, revtype, role_id, permission_id) VALUES (v_rev, 0, v_admin, v_perm);
        INSERT INTO role_aud (id, rev, revtype, nom, description) VALUES (v_admin, v_rev, 1, v_adm_nom, v_adm_desc);
        v_attributions := 1;
    END IF;

    INSERT INTO audit_revision_entite (revision_id, entite) VALUES
        (v_rev, 'staport.rh.auth.entities.Permission');
    IF v_attributions > 0 THEN
        INSERT INTO audit_revision_entite (revision_id, entite)
        VALUES (v_rev, 'staport.rh.auth.entities.Role');
    END IF;

    INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                               request_id, nombre_elements, perimetre, revision_id)
    SELECT now(), 'OPERATION', 'PERMISSION_CREATION', 'CREATE', 'SUCCES', 'Système', 'MIGRATION', request_id,
           1 + v_attributions,
           jsonb_build_object('migration', 'V36__permission_ia_utiliser', 'permission', 'IA_UTILISER',
                              'rolesAttribues', v_attributions), id
    FROM audit_revision WHERE id = v_rev;
END $$;

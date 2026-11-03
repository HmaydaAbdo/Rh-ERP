-- Un employé INACTIF n'a pas d'affectation courante. Les affectations historiques restent portées par les bulletins Paie.
DO $$
DECLARE
    v_rev BIGINT;
    v_modifies INTEGER := 0;
    v_migration CONSTANT TEXT := 'V33__employe_inactif_sans_affectation';
BEGIN
    EXECUTE 'ALTER TABLE employe ALTER COLUMN chantier_id DROP NOT NULL';

    IF EXISTS (SELECT 1 FROM employe WHERE statut = 'INACTIF' AND (chantier_id IS NOT NULL OR equipe_id IS NOT NULL)) THEN
        INSERT INTO audit_revision (horodatage, utilisateur_id, utilisateur_nom, origine, request_id, adresse_ip)
        VALUES (now(), NULL, 'Système', 'MIGRATION', gen_random_uuid()::text, NULL)
        RETURNING id INTO v_rev;

        WITH modifies AS (
            UPDATE employe
               SET chantier_id = NULL, equipe_id = NULL, version = version + 1
             WHERE statut = 'INACTIF' AND (chantier_id IS NOT NULL OR equipe_id IS NOT NULL)
            RETURNING *
        )
        INSERT INTO employe_aud (id, rev, revtype, nom_prenom, cin, date_naissance, date_embauche, fonction_id,
                                 chantier_id, statut, equipe_id, salaire, type_salaire)
        SELECT id, v_rev, 1, nom_prenom, cin, date_naissance, date_embauche, fonction_id,
               chantier_id, statut, equipe_id, salaire, type_salaire
        FROM modifies;
        GET DIAGNOSTICS v_modifies = ROW_COUNT;

        IF v_modifies > 0 THEN
            INSERT INTO audit_revision_entite (revision_id, entite)
            VALUES (v_rev, 'staport.rh.employee.entities.Employee');
            INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                                       request_id, nombre_elements, perimetre, revision_id)
            SELECT now(), 'OPERATION', 'EMPLOYE_MODIFICATION', 'UPDATE', 'SUCCES', 'Système', 'MIGRATION', request_id,
                   v_modifies, jsonb_build_object('migration', v_migration, 'motif', 'Retrait des affectations courantes des employés inactifs'), id
            FROM audit_revision WHERE id = v_rev;
        END IF;
    END IF;

    EXECUTE 'ALTER TABLE employe DROP CONSTRAINT IF EXISTS ck_employe_affectations_statut';
    EXECUTE $constraint$
        ALTER TABLE employe ADD CONSTRAINT ck_employe_affectations_statut
            CHECK ((statut = 'INACTIF' AND chantier_id IS NULL AND equipe_id IS NULL)
                OR (statut = 'ACTIF' AND chantier_id IS NOT NULL))
    $constraint$;
END $$;

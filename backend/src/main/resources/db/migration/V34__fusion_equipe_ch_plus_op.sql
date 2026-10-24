-- Fusion de l'équipe temporaire CH+OP dans les équipes métier existantes (voir docs/equipe/README.md).
-- Les bulletins historiques sont corrigés selon leur fonction, sans être supprimés. Les fiches
-- INACTIF restent sans affectation conformément à V33. Toute fonction non classée bloque la migration.
DO $$
DECLARE
    v_source_id BIGINT;
    v_ch_id BIGINT;
    v_op_id BIGINT;
    v_ee_id BIGINT;
    v_rev BIGINT;
    v_employes INTEGER := 0;
    v_paies INTEGER := 0;
    v_equipes INTEGER := 0;
    v_inconnues TEXT;
    v_migration CONSTANT TEXT := 'V34__fusion_equipe_ch_plus_op';
BEGIN
    SELECT id INTO v_source_id FROM equipe WHERE UPPER(BTRIM(code)) = 'CH+OP';
    IF v_source_id IS NULL THEN
        RAISE NOTICE 'Équipe CH+OP absente : aucune fusion à effectuer.';
        RETURN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM equipe WHERE id = v_source_id AND UPPER(BTRIM(libelle)) = 'CHAUFFEURS + OPERATEURS') THEN
        RAISE EXCEPTION 'V34: le code CH+OP existe avec un libellé inattendu; migration arrêtée.';
    END IF;

    SELECT id INTO v_ch_id FROM equipe WHERE UPPER(BTRIM(code)) = 'CH';
    SELECT id INTO v_op_id FROM equipe WHERE UPPER(BTRIM(code)) = 'OP';
    SELECT id INTO v_ee_id FROM equipe WHERE UPPER(BTRIM(code)) = 'EE';
    IF v_ch_id IS NULL OR v_op_id IS NULL OR v_ee_id IS NULL THEN
        RAISE EXCEPTION 'V34: équipes cibles CH, OP et EE requises; migration arrêtée.';
    END IF;

    IF EXISTS (SELECT 1 FROM employe WHERE equipe_id = v_source_id AND statut = 'INACTIF') THEN
        RAISE EXCEPTION 'V34: des fiches INACTIF portent encore CH+OP; appliquer d’abord V33.';
    END IF;

    IF EXISTS (SELECT 1 FROM employe WHERE equipe_id = v_source_id AND fonction_id IS NULL)
       OR EXISTS (SELECT 1 FROM paie WHERE equipe_id = v_source_id AND fonction_id IS NULL) THEN
        RAISE EXCEPTION 'V34: une fiche ou un bulletin CH+OP ne possède pas de fonction; migration arrêtée.';
    END IF;

    SELECT string_agg(libelle || ' (fiches: ' || fiches || ', bulletins: ' || bulletins || ')', ', ' ORDER BY libelle)
      INTO v_inconnues
      FROM (
          SELECT f.libelle,
                 count(DISTINCT e.id) FILTER (WHERE e.equipe_id = v_source_id) AS fiches,
                 count(DISTINCT p.id) FILTER (WHERE p.equipe_id = v_source_id) AS bulletins
            FROM fonction f
            LEFT JOIN employe e ON e.fonction_id = f.id
            LEFT JOIN paie p ON p.fonction_id = f.id
           GROUP BY f.id, f.libelle
          HAVING (count(*) FILTER (WHERE e.equipe_id = v_source_id) > 0
                   AND UPPER(BTRIM(f.libelle)) NOT LIKE 'CH.%'
                   AND UPPER(BTRIM(f.libelle)) NOT LIKE 'OP.%'
                   AND UPPER(BTRIM(f.libelle)) NOT IN ('COURSIER', 'CHEF DE POSTE'))
              OR (count(*) FILTER (WHERE p.equipe_id = v_source_id) > 0
                   AND UPPER(BTRIM(f.libelle)) NOT LIKE 'CH.%'
                   AND UPPER(BTRIM(f.libelle)) NOT LIKE 'OP.%'
                   AND UPPER(BTRIM(f.libelle)) NOT IN ('COURSIER', 'CHEF DE POSTE'))
      ) AS non_classees;
    IF v_inconnues IS NOT NULL THEN
        RAISE EXCEPTION 'V34: fonction(s) non classée(s) pour CH+OP : %', v_inconnues;
    END IF;

    INSERT INTO audit_revision (horodatage, utilisateur_id, utilisateur_nom, origine, request_id, adresse_ip)
    VALUES (now(), NULL, 'Système', 'MIGRATION', gen_random_uuid()::text, NULL)
    RETURNING id INTO v_rev;

    WITH modifies AS (
        UPDATE employe e
           SET equipe_id = CASE
                   WHEN UPPER(BTRIM(f.libelle)) LIKE 'CH.%' OR UPPER(BTRIM(f.libelle)) = 'COURSIER' THEN v_ch_id
                   WHEN UPPER(BTRIM(f.libelle)) LIKE 'OP.%' THEN v_op_id
                   WHEN UPPER(BTRIM(f.libelle)) = 'CHEF DE POSTE' THEN v_ee_id
               END,
               version = e.version + 1
          FROM fonction f
         WHERE e.fonction_id = f.id AND e.equipe_id = v_source_id
        RETURNING e.*
    )
    INSERT INTO employe_aud (id, rev, revtype, nom_prenom, cin, date_naissance, date_embauche, fonction_id,
                             chantier_id, statut, equipe_id, salaire, type_salaire)
    SELECT id, v_rev, 1, nom_prenom, cin, date_naissance, date_embauche, fonction_id,
           chantier_id, statut, equipe_id, salaire, type_salaire
      FROM modifies;
    GET DIAGNOSTICS v_employes = ROW_COUNT;

    WITH modifies AS (
        UPDATE paie p
           SET equipe_id = CASE
                   WHEN UPPER(BTRIM(f.libelle)) LIKE 'CH.%' OR UPPER(BTRIM(f.libelle)) = 'COURSIER' THEN v_ch_id
                   WHEN UPPER(BTRIM(f.libelle)) LIKE 'OP.%' THEN v_op_id
                   WHEN UPPER(BTRIM(f.libelle)) = 'CHEF DE POSTE' THEN v_ee_id
               END,
               version = p.version + 1
          FROM fonction f
         WHERE p.fonction_id = f.id AND p.equipe_id = v_source_id
        RETURNING p.*
    )
    INSERT INTO paie_aud (id, rev, revtype, employee_id, periode, fonction_id, chantier_id, equipe_id,
                          nombre_jours_travailles, jours_recuperation_ouvrable, jours_recuperation_dimanche,
                          salaire_mensuel, prime_roulage_ordinaire, prime_roulage_dimanche, salaire_total, observation)
    SELECT id, v_rev, 1, employee_id, periode, fonction_id, chantier_id, equipe_id,
           nombre_jours_travailles, jours_recuperation_ouvrable, jours_recuperation_dimanche,
           salaire_mensuel, prime_roulage_ordinaire, prime_roulage_dimanche, salaire_total, observation
      FROM modifies;
    GET DIAGNOSTICS v_paies = ROW_COUNT;

    WITH supprimee AS (
        DELETE FROM equipe WHERE id = v_source_id RETURNING *
    )
    INSERT INTO equipe_aud (id, rev, revtype, code, libelle)
    SELECT id, v_rev, 2, code, libelle FROM supprimee;
    GET DIAGNOSTICS v_equipes = ROW_COUNT;

    INSERT INTO audit_revision_entite (revision_id, entite)
    VALUES (v_rev, 'staport.rh.equipe.entities.Equipe');
    INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                               request_id, nombre_elements, perimetre, revision_id)
    SELECT now(), 'OPERATION', 'EQUIPE_SUPPRESSION', 'DELETE', 'SUCCES', 'Système', 'MIGRATION', request_id,
           v_equipes, jsonb_build_object('migration', v_migration, 'code', 'CH+OP'), id
      FROM audit_revision WHERE id = v_rev;

    IF v_employes > 0 THEN
        INSERT INTO audit_revision_entite (revision_id, entite)
        VALUES (v_rev, 'staport.rh.employee.entities.Employee');
        INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                                   request_id, nombre_elements, perimetre, revision_id)
        SELECT now(), 'OPERATION', 'EMPLOYE_MODIFICATION', 'UPDATE', 'SUCCES', 'Système', 'MIGRATION', request_id,
               v_employes, jsonb_build_object('migration', v_migration, 'source', 'CH+OP'), id
          FROM audit_revision WHERE id = v_rev;
    END IF;

    IF v_paies > 0 THEN
        INSERT INTO audit_revision_entite (revision_id, entite)
        VALUES (v_rev, 'staport.rh.paie.entities.Paie');
        INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                                   request_id, nombre_elements, perimetre, revision_id)
        SELECT now(), 'OPERATION', 'PAIE_MODIFICATION', 'UPDATE', 'SUCCES', 'Système', 'MIGRATION', request_id,
               v_paies, jsonb_build_object('migration', v_migration, 'source', 'CH+OP'), id
          FROM audit_revision WHERE id = v_rev;
    END IF;
END $$;

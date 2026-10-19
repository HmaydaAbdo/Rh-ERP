-- Reprise des employés à partir de la paie (décision du propriétaire, 2026-10-18 ; voir
-- docs/adr/0010-employe-etat-du-dernier-mois-de-paie.md). Une seule révision d'audit (origine MIGRATION) couvre tout :
--
--   1. Départs constatés par la paie : chaque bulletin marqué « STC » ou « sortie » (même règle que ObservationStc)
--      devient un départ de ce mois-là, motif « STC » ou « Sortie ».
--   2. Départs par absence : un employé payé, absent du dernier mois importé, et dont le dernier bulletin n'est pas un
--      STC, a quitté l'entreprise le mois qui suit son dernier bulletin (motif « Absent de la paie (reprise) »).
--   3. Chaque fiche payée reprend l'état de SON dernier bulletin : fonction, chantier, équipe ; le salaire et son type
--      viennent du dernier bulletin non nul (salaire_mensuel ≤ 200 : tarif journalier, sinon mensuel — dans les données
--      reprises, aucun salaire n'est compris entre 200 et 2 500). ACTIF seulement si l'employé est payé au dernier mois
--      importé sans STC ; INACTIF sinon.
--   4. Les employés sans AUCUN bulletin sont supprimés. Seule exception : un employé lié à un compte utilisateur ne peut
--      pas l'être ; il passe INACTIF avec un départ au dernier mois (motif « Aucune paie (reprise) »).
--
-- Sans aucune paie en base (installation neuve), la reprise ne fait rien : elle ne doit jamais vider les employés.
DO $$
DECLARE
    v_dernier     INT;
    v_rev         BIGINT;
    v_sorties     INTEGER := 0;
    v_n           INTEGER;
    v_modifies    INTEGER;
    v_supprimes   INTEGER;
    v_migration   CONSTANT TEXT := 'V30__employe_reprise_depuis_la_paie';
BEGIN
    SELECT max(periode) INTO v_dernier FROM paie;
    IF v_dernier IS NULL THEN
        RAISE NOTICE 'Aucune paie en base : reprise des employés sans objet.';
        RETURN;
    END IF;

    INSERT INTO audit_revision (horodatage, utilisateur_id, utilisateur_nom, origine, request_id, adresse_ip)
    VALUES (now(), NULL, 'Système', 'MIGRATION', gen_random_uuid()::text, NULL)
    RETURNING id INTO v_rev;

    -- 1. Départs constatés par la paie (STC / sortie)
    WITH ajoutees AS (
        INSERT INTO employe_sortie (employee_id, periode, motif)
        SELECT employee_id, periode, CASE WHEN lower(btrim(observation)) = 'stc' THEN 'STC' ELSE 'Sortie' END
        FROM paie
        WHERE lower(btrim(observation)) IN ('stc', 'sortie')
        RETURNING *
    )
    INSERT INTO employe_sortie_aud (id, rev, revtype, employee_id, periode, motif)
    SELECT id, v_rev, 0, employee_id, periode, motif FROM ajoutees;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_sorties := v_sorties + v_n;

    -- 2. Départs par absence du dernier mois importé : le mois qui suit le dernier bulletin
    WITH derniers AS (
        SELECT DISTINCT ON (employee_id) employee_id, periode, observation
        FROM paie
        ORDER BY employee_id, periode DESC
    ), ajoutees AS (
        INSERT INTO employe_sortie (employee_id, periode, motif)
        SELECT employee_id,
               to_char(to_date(periode::text, 'YYYYMM') + INTERVAL '1 month', 'YYYYMM')::int,
               'Absent de la paie (reprise)'
        FROM derniers
        WHERE periode < v_dernier
          AND lower(btrim(coalesce(observation, ''))) NOT IN ('stc', 'sortie')
        RETURNING *
    )
    INSERT INTO employe_sortie_aud (id, rev, revtype, employee_id, periode, motif)
    SELECT id, v_rev, 0, employee_id, periode, motif FROM ajoutees;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_sorties := v_sorties + v_n;

    -- 3. Chaque fiche payée reprend l'état de son dernier bulletin
    WITH derniers AS (
        SELECT DISTINCT ON (employee_id) employee_id, periode, fonction_id, chantier_id, equipe_id, observation
        FROM paie
        ORDER BY employee_id, periode DESC
    ), salaires AS (
        SELECT DISTINCT ON (employee_id) employee_id, salaire_mensuel
        FROM paie
        WHERE salaire_mensuel > 0
        ORDER BY employee_id, periode DESC
    ), cibles AS (
        SELECT d.employee_id, d.fonction_id, d.chantier_id, d.equipe_id,
               s.salaire_mensuel AS salaire,
               CASE WHEN s.salaire_mensuel IS NULL THEN NULL
                    WHEN s.salaire_mensuel <= 200 THEN 'JOURNALIER'
                    ELSE 'MENSUEL' END AS type_salaire,
               CASE WHEN d.periode = v_dernier AND lower(btrim(coalesce(d.observation, ''))) NOT IN ('stc', 'sortie')
                    THEN 'ACTIF' ELSE 'INACTIF' END AS statut
        FROM derniers d
        LEFT JOIN salaires s ON s.employee_id = d.employee_id
    ), modifies AS (
        UPDATE employe e
           SET fonction_id = c.fonction_id, chantier_id = c.chantier_id, equipe_id = c.equipe_id,
               salaire = c.salaire, type_salaire = c.type_salaire, statut = c.statut, version = e.version + 1
          FROM cibles c
         WHERE e.id = c.employee_id
           AND (e.fonction_id, e.chantier_id, e.equipe_id, e.salaire, e.type_salaire, e.statut)
               IS DISTINCT FROM (c.fonction_id, c.chantier_id, c.equipe_id, c.salaire, c.type_salaire, c.statut)
        RETURNING e.*
    )
    INSERT INTO employe_aud (id, rev, revtype, nom_prenom, cin, date_naissance, date_embauche, fonction_id, chantier_id,
                             statut, equipe_id, salaire, type_salaire)
    SELECT id, v_rev, 1, nom_prenom, cin, date_naissance, date_embauche, fonction_id, chantier_id,
           statut, equipe_id, salaire, type_salaire
    FROM modifies;
    GET DIAGNOSTICS v_modifies = ROW_COUNT;

    -- 4a. Sans aucune paie mais lié à un compte : ne peut pas être supprimé, passe INACTIF avec un départ au dernier mois
    WITH ajoutees AS (
        INSERT INTO employe_sortie (employee_id, periode, motif)
        SELECT e.id, v_dernier, 'Aucune paie (reprise)'
        FROM employe e
        WHERE NOT EXISTS (SELECT 1 FROM paie p WHERE p.employee_id = e.id)
          AND EXISTS (SELECT 1 FROM utilisateur u WHERE u.employee_id = e.id)
        RETURNING *
    )
    INSERT INTO employe_sortie_aud (id, rev, revtype, employee_id, periode, motif)
    SELECT id, v_rev, 0, employee_id, periode, motif FROM ajoutees;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_sorties := v_sorties + v_n;

    WITH modifies AS (
        UPDATE employe e
           SET statut = 'INACTIF', version = e.version + 1
         WHERE e.statut <> 'INACTIF'
           AND NOT EXISTS (SELECT 1 FROM paie p WHERE p.employee_id = e.id)
           AND EXISTS (SELECT 1 FROM utilisateur u WHERE u.employee_id = e.id)
        RETURNING e.*
    )
    INSERT INTO employe_aud (id, rev, revtype, nom_prenom, cin, date_naissance, date_embauche, fonction_id, chantier_id,
                             statut, equipe_id, salaire, type_salaire)
    SELECT id, v_rev, 1, nom_prenom, cin, date_naissance, date_embauche, fonction_id, chantier_id,
           statut, equipe_id, salaire, type_salaire
    FROM modifies;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_modifies := v_modifies + v_n;

    -- 4b. Sans aucune paie : supprimé (l'instantané d'audit garde ses données, comme une suppression par l'application)
    WITH supprimes AS (
        DELETE FROM employe e
         WHERE NOT EXISTS (SELECT 1 FROM paie p WHERE p.employee_id = e.id)
           AND NOT EXISTS (SELECT 1 FROM utilisateur u WHERE u.employee_id = e.id)
        RETURNING e.*
    )
    INSERT INTO employe_aud (id, rev, revtype, nom_prenom, cin, date_naissance, date_embauche, fonction_id, chantier_id,
                             statut, equipe_id, salaire, type_salaire)
    SELECT id, v_rev, 2, nom_prenom, cin, date_naissance, date_embauche, fonction_id, chantier_id,
           statut, equipe_id, salaire, type_salaire
    FROM supprimes;
    GET DIAGNOSTICS v_supprimes = ROW_COUNT;

    IF v_modifies + v_supprimes > 0 THEN
        INSERT INTO audit_revision_entite (revision_id, entite) VALUES (v_rev, 'staport.rh.employee.entities.Employee');
    END IF;
    IF v_sorties > 0 THEN
        INSERT INTO audit_revision_entite (revision_id, entite) VALUES (v_rev, 'staport.rh.employee.entities.EmployeeSortie');
    END IF;

    IF v_sorties > 0 THEN
        INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                                   request_id, nombre_elements, perimetre, revision_id)
        SELECT now(), 'OPERATION', 'EMPLOYE_SORTIE', 'CREATE', 'SUCCES', 'Système', 'MIGRATION', request_id, v_sorties,
               jsonb_build_object('migration', v_migration, 'dernierMois', v_dernier), id
        FROM audit_revision WHERE id = v_rev;
    END IF;
    IF v_modifies > 0 THEN
        INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                                   request_id, nombre_elements, perimetre, revision_id)
        SELECT now(), 'OPERATION', 'EMPLOYE_MODIFICATION', 'UPDATE', 'SUCCES', 'Système', 'MIGRATION', request_id, v_modifies,
               jsonb_build_object('migration', v_migration, 'dernierMois', v_dernier), id
        FROM audit_revision WHERE id = v_rev;
    END IF;
    IF v_supprimes > 0 THEN
        INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                                   request_id, nombre_elements, perimetre, revision_id)
        SELECT now(), 'OPERATION', 'EMPLOYE_SUPPRESSION', 'DELETE', 'SUCCES', 'Système', 'MIGRATION', request_id, v_supprimes,
               jsonb_build_object('migration', v_migration, 'motif', 'Aucun bulletin de paie'), id
        FROM audit_revision WHERE id = v_rev;
    END IF;
END $$;

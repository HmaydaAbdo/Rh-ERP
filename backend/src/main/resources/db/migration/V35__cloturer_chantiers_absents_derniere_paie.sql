-- La dernière paie enregistrée fait foi pour l'état opérationnel des chantiers (décision du propriétaire, 2026-10-24).
-- Les chantiers absents de ce mois sont clôturés, même s'ils ont des bulletins historiques. Aucune paie en base signifie
-- qu'il n'y a pas de mois de référence : l'installation neuve reste inchangée. Une seule révision d'audit couvre les mises à jour.
DO $$
DECLARE
    v_periode    INTEGER;
    v_rev        BIGINT;
    v_clotures   INTEGER;
    v_migration  CONSTANT TEXT := 'V35__cloturer_chantiers_absents_derniere_paie';
BEGIN
    SELECT MAX(periode) INTO v_periode FROM paie;
    IF v_periode IS NULL THEN
        RAISE NOTICE 'Aucune paie en base : aucun mois de référence, les chantiers restent inchangés.';
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM chantier c
         WHERE c.actif
           AND NOT EXISTS (
               SELECT 1 FROM paie p WHERE p.chantier_id = c.id AND p.periode = v_periode
           )
    ) THEN
        RAISE NOTICE 'Tous les chantiers actifs apparaissent dans la paie %.', v_periode;
        RETURN;
    END IF;

    INSERT INTO audit_revision (horodatage, utilisateur_id, utilisateur_nom, origine, request_id, adresse_ip)
    VALUES (now(), NULL, 'Système', 'MIGRATION', gen_random_uuid()::text, NULL)
    RETURNING id INTO v_rev;

    WITH clotures AS (
        UPDATE chantier c
           SET actif = false, version = c.version + 1
         WHERE c.actif
           AND NOT EXISTS (
               SELECT 1 FROM paie p WHERE p.chantier_id = c.id AND p.periode = v_periode
           )
        RETURNING c.*
    )
    INSERT INTO chantier_aud (id, rev, revtype, code, designation, nom, source_erp, actif)
    SELECT id, v_rev, 1, code, designation, nom, source_erp, actif FROM clotures;
    GET DIAGNOSTICS v_clotures = ROW_COUNT;

    IF v_clotures > 0 THEN
        INSERT INTO audit_revision_entite (revision_id, entite)
        VALUES (v_rev, 'staport.rh.chantier.entities.Chantier');
        INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                                   request_id, nombre_elements, perimetre, revision_id)
        SELECT now(), 'OPERATION', 'CHANTIER_MODIFICATION', 'UPDATE', 'SUCCES', 'Système', 'MIGRATION', request_id,
               v_clotures,
               jsonb_build_object('migration', v_migration, 'motif', 'Absent de la dernière paie enregistrée', 'periode', v_periode),
               id
          FROM audit_revision WHERE id = v_rev;
    END IF;
END $$;

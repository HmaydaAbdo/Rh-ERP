-- Nettoyage des référentiels à partir de la paie (décision du propriétaire, 2026-10-19), joué une seule fois. Une seule
-- révision d'audit (origine MIGRATION) couvre tout :
--
--   1. Les fonctions qui n'apparaissent sur AUCUN bulletin de paie sont supprimées. Une fonction encore portée par une
--      fiche employé est gardée (après V30, aucune ne l'est : chaque fiche reprend la fonction de son dernier bulletin).
--   2. Les chantiers qui n'apparaissent sur AUCUN bulletin de paie passent « Clôturé » (actif = false). Ils restent en
--      base : la synchronisation ERP les connaît et l'assistant d'import propose de les rouvrir s'ils reviennent.
--
-- Sans aucune paie en base (installation neuve), le nettoyage ne fait rien : il ne doit jamais vider les référentiels.
DO $$
DECLARE
    v_rev        BIGINT;
    v_supprimees INTEGER;
    v_clotures   INTEGER;
    v_migration  CONSTANT TEXT := 'V31__fonctions_et_chantiers_sans_paie';
BEGIN
    IF NOT EXISTS (SELECT 1 FROM paie) THEN
        RAISE NOTICE 'Aucune paie en base : nettoyage des fonctions et des chantiers sans objet.';
        RETURN;
    END IF;

    INSERT INTO audit_revision (horodatage, utilisateur_id, utilisateur_nom, origine, request_id, adresse_ip)
    VALUES (now(), NULL, 'Système', 'MIGRATION', gen_random_uuid()::text, NULL)
    RETURNING id INTO v_rev;

    -- 1. Fonctions sans aucun bulletin (l'instantané d'audit garde le libellé, comme une suppression par l'application)
    WITH supprimees AS (
        DELETE FROM fonction f
         WHERE NOT EXISTS (SELECT 1 FROM paie p WHERE p.fonction_id = f.id)
           AND NOT EXISTS (SELECT 1 FROM employe e WHERE e.fonction_id = f.id)
        RETURNING f.*
    )
    INSERT INTO fonction_aud (id, rev, revtype, libelle)
    SELECT id, v_rev, 2, libelle FROM supprimees;
    GET DIAGNOSTICS v_supprimees = ROW_COUNT;

    -- 2. Chantiers sans aucun bulletin : clôturés. Le code perd ses espaces extérieurs hérités d'avant V27 (même
    --    normalisation que l'application et la synchronisation ERP), sans quoi la contrainte refuserait la mise à jour.
    WITH clotures AS (
        UPDATE chantier c
           SET actif = false, code = btrim(c.code, E' \t\n\r\f\013'), version = c.version + 1
         WHERE c.actif
           AND NOT EXISTS (SELECT 1 FROM paie p WHERE p.chantier_id = c.id)
        RETURNING c.*
    )
    INSERT INTO chantier_aud (id, rev, revtype, code, designation, nom, source_erp, actif)
    SELECT id, v_rev, 1, code, designation, nom, source_erp, actif FROM clotures;
    GET DIAGNOSTICS v_clotures = ROW_COUNT;

    IF v_supprimees > 0 THEN
        INSERT INTO audit_revision_entite (revision_id, entite) VALUES (v_rev, 'staport.rh.function.entities.Function');
        INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                                   request_id, nombre_elements, perimetre, revision_id)
        SELECT now(), 'OPERATION', 'FONCTION_SUPPRESSION', 'DELETE', 'SUCCES', 'Système', 'MIGRATION', request_id,
               v_supprimees, jsonb_build_object('migration', v_migration, 'motif', 'Aucun bulletin de paie'), id
        FROM audit_revision WHERE id = v_rev;
    END IF;
    IF v_clotures > 0 THEN
        INSERT INTO audit_revision_entite (revision_id, entite) VALUES (v_rev, 'staport.rh.chantier.entities.Chantier');
        INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                                   request_id, nombre_elements, perimetre, revision_id)
        SELECT now(), 'OPERATION', 'CHANTIER_MODIFICATION', 'UPDATE', 'SUCCES', 'Système', 'MIGRATION', request_id,
               v_clotures, jsonb_build_object('migration', v_migration, 'motif', 'Aucun bulletin de paie'), id
        FROM audit_revision WHERE id = v_rev;
    END IF;
END $$;

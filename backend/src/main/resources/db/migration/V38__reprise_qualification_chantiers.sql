-- Source : Chantiers_Maroc.xlsx fourni le 26 octobre 2026 (SHA-256 : 415cde6d0f9120ea648485fc7735d97c95d844241a27a03dfe832cdac69679ba).
-- Reprise unique par code, sans création de chantier ni modification de son statut.
-- Les chantiers déjà qualifiés depuis V37 sont préservés ; aucun point manquant n'est déduit.
CREATE TEMPORARY TABLE reprise_qualification_chantier (
    code VARCHAR(100) PRIMARY KEY, nom VARCHAR(255), nature VARCHAR(30), localisation VARCHAR(2048),
    latitude NUMERIC(11,8), longitude NUMERIC(11,8), afficher_sur_carte BOOLEAN NOT NULL
) ON COMMIT DROP;

INSERT INTO reprise_qualification_chantier VALUES
    ('C163', 'AIT HKIM', 'AO', NULL, NULL, NULL, false),
    ('C057', 'DEPOT HARBIL', 'DEPOT', 'https://www.google.com/maps/search/?api=1&query=31.7243258,-8.1033938', 31.7243258, -8.1033938, true),
    ('C085', 'TIZNIT', 'AO', 'https://www.google.com/maps/search/?api=1&query=29.6799539,-9.7697539', 29.6799539, -9.7697539, false),
    ('C125', 'OUED ZEM', 'AO', 'https://www.google.com/maps/search/?api=1&query=33.1420569,-6.4029196', 33.1420569, -6.4029196, false),
    ('C129', 'STATION DES EMULSIONS', 'EMULSION', 'https://www.google.com/maps/search/?api=1&query=31.7243258,-8.1033938', 31.7243258, -8.1033938, true),
    ('C167', 'TAMANSOURT', 'AO', 'https://www.google.com/maps/search/?api=1&query=31.7790527,-8.1320166', 31.7790527, -8.1320166, false),
    ('C168', 'NADOR', 'AO', 'https://www.google.com/maps/search/?api=1&query=35.0817411,-3.152588', 35.0817411, -3.152588, true),
    ('C168A', 'CONC. NADOR', 'CONCASSAGE', 'https://www.google.com/maps/search/?api=1&query=35.0829942,-3.0741165', 35.0829942, -3.0741165, true),
    ('C168A3', 'CONC.NADOR 3', 'CONCASSAGE', 'https://www.google.com/maps/search/?api=1&query=34.9509417,-3.228005', 34.9509417, -3.228005, true),
    ('C176B', 'POSTE TAMANSOURT', 'POSTE_ENROBE', 'https://www.google.com/maps/search/?api=1&query=31.792995,-8.1483877', 31.792995, -8.1483877, false),
    ('C177', 'AVENUE DE PORT', 'AO', 'https://www.google.com/maps/search/?api=1&query=9.51399954,-13.70799476', 9.51399954, -13.70799476, false),
    ('C184A', 'CONC. IKNIOUNE', 'CONCASSAGE', 'https://www.google.com/maps/search/?api=1&query=31.2720212,-5.818916', 31.2720212, -5.818916, false),
    ('C186', 'BARRAGE MESKDAL', 'AO', 'https://www.google.com/maps/search/?api=1&query=33.64241,-4.143123', 33.64241, -4.143123, true),
    ('C186A', 'CONC. BARRAGE MESKDAL', 'CONCASSAGE', 'https://www.google.com/maps/search/?api=1&query=33.64241,-4.143123', 33.64241, -4.143123, true),
    ('C186C', 'Central à Beton barrage miskdal', 'CENTRALE_A_BETON', 'https://www.google.com/maps/search/?api=1&query=33.64241,-4.143123', 33.64241, -4.143123, true),
    ('C196', 'AVENUE MY ABD ELLAH', 'AO', 'https://www.google.com/maps/search/?api=1&query=31.6754295,-8.0400382', 31.6754295, -8.0400382, true),
    ('C198', 'TINGHIR', 'AO', 'https://www.google.com/maps/search/?api=1&query=31.1793436,-5.6543473', 31.1793436, -5.6543473, true),
    ('C204', 'Eau potable MY ABD ELLAH', 'AO', 'https://www.google.com/maps/search/?api=1&query=31.6754295,-8.0400382', 31.6754295, -8.0400382, true),
    ('C206', 'BENSLIMANE', 'AO', 'https://www.google.com/maps/search/?api=1&query=33.6684667,-7.2464067', 33.6684667, -7.2464067, true),
    ('C206B', 'POSTE BENSLIMANE', 'POSTE_ENROBE', 'https://www.google.com/maps/search/?api=1&query=33.667985,-7.2482212', 33.667985, -7.2482212, true),
    ('C208', 'GUERSIF', 'AO', 'https://www.google.com/maps/search/?api=1&query=34.2362612,-3.3416729', 34.2362612, -3.3416729, true),
    ('C208B', 'Poste d''enrobée GUERCIF', 'POSTE_ENROBE', 'https://www.google.com/maps/search/?api=1&query=34.2362612,-3.3416729', 34.2362612, -3.3416729, true),
    ('C209', 'TAROUDANET', 'AO', 'https://www.google.com/maps/search/?api=1&query=30.7256502,-7.9816645', 30.7256502, -7.9816645, true),
    ('C214', 'MEKNES', 'AO', 'https://www.google.com/maps/search/?api=1&query=33.8648011,-5.5965549', 33.8648011, -5.5965549, true),
    ('C214B', 'poste enrobe meknes', 'POSTE_ENROBE', 'https://www.google.com/maps/search/?api=1&query=33.86521,-5.59694', 33.86521, -5.59694, true),
    ('C219', 'Selouane', 'AO', 'https://www.google.com/maps/search/?api=1&query=35.0817411,-3.152588', 35.0817411, -3.152588, true),
    ('CONAKRY', 'AVENUE GENERAL LANSANA CONTE', 'AO', 'https://www.google.com/maps/search/?api=1&query=9.50960168,-13.71498997', 9.50960168, -13.71498997, false);

DO $$
DECLARE
    v_rev BIGINT;
    v_nombre INTEGER;
    v_migration CONSTANT TEXT := 'V38__reprise_qualification_chantiers';
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM chantier c JOIN reprise_qualification_chantier r ON upper(btrim(c.code)) = r.code
        WHERE c.nature IS NULL AND c.localisation IS NULL AND c.latitude IS NULL AND c.longitude IS NULL AND NOT c.afficher_sur_carte
    ) THEN
        RETURN;
    END IF;

    INSERT INTO audit_revision (horodatage, utilisateur_id, utilisateur_nom, origine, request_id, adresse_ip)
    VALUES (now(), NULL, 'Système', 'MIGRATION', gen_random_uuid()::text, NULL)
    RETURNING id INTO v_rev;

    WITH qualifies AS (
        UPDATE chantier c
        SET nom = r.nom, nature = r.nature, localisation = r.localisation, latitude = r.latitude,
            longitude = r.longitude, afficher_sur_carte = r.afficher_sur_carte, version = c.version + 1
        FROM reprise_qualification_chantier r
        WHERE upper(btrim(c.code)) = r.code
          AND c.nature IS NULL AND c.localisation IS NULL AND c.latitude IS NULL AND c.longitude IS NULL AND NOT c.afficher_sur_carte
        RETURNING c.*
    )
    INSERT INTO chantier_aud (id, rev, revtype, code, designation, nom, source_erp, actif,
                              nature, localisation, latitude, longitude, afficher_sur_carte)
    SELECT id, v_rev, 1, code, designation, nom, source_erp, actif, nature, localisation, latitude, longitude, afficher_sur_carte FROM qualifies;
    GET DIAGNOSTICS v_nombre = ROW_COUNT;

    INSERT INTO audit_revision_entite (revision_id, entite)
    VALUES (v_rev, 'staport.rh.chantier.entities.Chantier');
    INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                               request_id, nombre_elements, perimetre, revision_id)
    SELECT now(), 'OPERATION', 'CHANTIER_MODIFICATION', 'UPDATE', 'SUCCES', 'Système', 'MIGRATION', request_id,
           v_nombre, jsonb_build_object('migration', v_migration, 'motif', 'Qualification géographique du référentiel Chantier'), id
    FROM audit_revision WHERE id = v_rev;
END $$;

DROP TABLE reprise_qualification_chantier;

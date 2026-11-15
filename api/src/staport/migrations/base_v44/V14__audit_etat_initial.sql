-- État initial de l'audit : une révision (origine MIGRATION) qui enregistre l'état de toutes les lignes existantes au
-- moment de la mise en place de l'audit, comme si elles venaient d'être ajoutées (revtype 0). Sans elle, la première
-- modification d'une donnée existante n'aurait pas d'« avant » : l'historique d'une ligne commencerait à sa première
-- modification, pas à son état d'origine.
--
-- Tout ce qui précède cette migration (V1 à V13) est antérieur à l'audit : cette révision en est le point de départ.
-- Toute migration suivante qui modifie des données auditées suit le gabarit de conventions/database.md.
--
-- Une table de liaison s'audite au nom de l'entité propriétaire de la collection (Role.permissions,
-- Utilisateur.roles, Utilisateur.permissionsRefusees). Pas de mot de passe dans utilisateur_aud (jamais audité).
DO $$
DECLARE
    v_rev    BIGINT;
    v_n      INTEGER;
    v_total  INTEGER := 0;
    v_detail JSONB := '{}'::jsonb;
BEGIN
    INSERT INTO audit_revision (horodatage, utilisateur_id, utilisateur_nom, origine, request_id, adresse_ip)
    VALUES (now(), NULL, 'Système', 'MIGRATION', gen_random_uuid()::text, NULL)
    RETURNING id INTO v_rev;

    -- fonction
    INSERT INTO fonction_aud (id, rev, revtype, libelle)
    SELECT id, v_rev, 0, libelle FROM fonction;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
    v_detail := v_detail || jsonb_build_object('fonction', v_n);
    IF v_n > 0 THEN
        INSERT INTO audit_revision_entite (revision_id, entite) VALUES (v_rev, 'staport.rh.function.entities.Function')
        ON CONFLICT DO NOTHING;
    END IF;

    -- chantier
    INSERT INTO chantier_aud (id, rev, revtype, code, designation, nom, source_erp, actif)
    SELECT id, v_rev, 0, code, designation, nom, source_erp, actif FROM chantier;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
    v_detail := v_detail || jsonb_build_object('chantier', v_n);
    IF v_n > 0 THEN
        INSERT INTO audit_revision_entite (revision_id, entite) VALUES (v_rev, 'staport.rh.chantier.entities.Chantier')
        ON CONFLICT DO NOTHING;
    END IF;

    -- equipe
    INSERT INTO equipe_aud (id, rev, revtype, code, libelle)
    SELECT id, v_rev, 0, code, libelle FROM equipe;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
    v_detail := v_detail || jsonb_build_object('equipe', v_n);
    IF v_n > 0 THEN
        INSERT INTO audit_revision_entite (revision_id, entite) VALUES (v_rev, 'staport.rh.equipe.entities.Equipe')
        ON CONFLICT DO NOTHING;
    END IF;

    -- employe
    INSERT INTO employe_aud (id, rev, revtype, nom_prenom, cin, date_naissance, date_embauche, fonction_id, chantier_id, statut)
    SELECT id, v_rev, 0, nom_prenom, cin, date_naissance, date_embauche, fonction_id, chantier_id, statut FROM employe;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
    v_detail := v_detail || jsonb_build_object('employe', v_n);
    IF v_n > 0 THEN
        INSERT INTO audit_revision_entite (revision_id, entite) VALUES (v_rev, 'staport.rh.employee.entities.Employee')
        ON CONFLICT DO NOTHING;
    END IF;

    -- paie
    INSERT INTO paie_aud (id, rev, revtype, employee_id, periode, fonction_id, chantier_id, equipe_id,
                          nombre_jours_travailles, jours_recuperation_ouvrable, jours_recuperation_dimanche,
                          salaire_mensuel, prime_roulage_ordinaire, prime_roulage_dimanche, salaire_total, observation)
    SELECT id, v_rev, 0, employee_id, periode, fonction_id, chantier_id, equipe_id,
           nombre_jours_travailles, jours_recuperation_ouvrable, jours_recuperation_dimanche,
           salaire_mensuel, prime_roulage_ordinaire, prime_roulage_dimanche, salaire_total, observation
    FROM paie;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
    v_detail := v_detail || jsonb_build_object('paie', v_n);
    IF v_n > 0 THEN
        INSERT INTO audit_revision_entite (revision_id, entite) VALUES (v_rev, 'staport.rh.paie.entities.Paie')
        ON CONFLICT DO NOTHING;
    END IF;

    -- permission
    INSERT INTO permission_aud (id, rev, revtype, code, description)
    SELECT id, v_rev, 0, code, description FROM permission;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
    v_detail := v_detail || jsonb_build_object('permission', v_n);
    IF v_n > 0 THEN
        INSERT INTO audit_revision_entite (revision_id, entite) VALUES (v_rev, 'staport.rh.auth.entities.Permission')
        ON CONFLICT DO NOTHING;
    END IF;

    -- role
    INSERT INTO role_aud (id, rev, revtype, nom, description)
    SELECT id, v_rev, 0, nom, description FROM role;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
    v_detail := v_detail || jsonb_build_object('role', v_n);
    IF v_n > 0 THEN
        INSERT INTO audit_revision_entite (revision_id, entite) VALUES (v_rev, 'staport.rh.auth.entities.Role')
        ON CONFLICT DO NOTHING;
    END IF;

    -- utilisateur (sans mot de passe)
    INSERT INTO utilisateur_aud (id, rev, revtype, username, email, actif, employee_id)
    SELECT id, v_rev, 0, username, email, actif, employee_id FROM utilisateur;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
    v_detail := v_detail || jsonb_build_object('utilisateur', v_n);
    IF v_n > 0 THEN
        INSERT INTO audit_revision_entite (revision_id, entite) VALUES (v_rev, 'staport.rh.auth.entities.Utilisateur')
        ON CONFLICT DO NOTHING;
    END IF;

    -- role_permission (Role.permissions)
    INSERT INTO role_permission_aud (rev, revtype, role_id, permission_id)
    SELECT v_rev, 0, role_id, permission_id FROM role_permission;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
    v_detail := v_detail || jsonb_build_object('role_permission', v_n);
    IF v_n > 0 THEN
        INSERT INTO audit_revision_entite (revision_id, entite) VALUES (v_rev, 'staport.rh.auth.entities.Role')
        ON CONFLICT DO NOTHING;
    END IF;

    -- utilisateur_role (Utilisateur.roles)
    INSERT INTO utilisateur_role_aud (rev, revtype, utilisateur_id, role_id)
    SELECT v_rev, 0, utilisateur_id, role_id FROM utilisateur_role;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
    v_detail := v_detail || jsonb_build_object('utilisateur_role', v_n);
    IF v_n > 0 THEN
        INSERT INTO audit_revision_entite (revision_id, entite) VALUES (v_rev, 'staport.rh.auth.entities.Utilisateur')
        ON CONFLICT DO NOTHING;
    END IF;

    -- utilisateur_permission_refusee (Utilisateur.permissionsRefusees)
    INSERT INTO utilisateur_permission_refusee_aud (rev, revtype, utilisateur_id, permission_id)
    SELECT v_rev, 0, utilisateur_id, permission_id FROM utilisateur_permission_refusee;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
    v_detail := v_detail || jsonb_build_object('utilisateur_permission_refusee', v_n);
    IF v_n > 0 THEN
        INSERT INTO audit_revision_entite (revision_id, entite) VALUES (v_rev, 'staport.rh.auth.entities.Utilisateur')
        ON CONFLICT DO NOTHING;
    END IF;

    -- L'entrée du journal : une seule, avec le nombre de lignes enregistrées par table.
    INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                               request_id, nombre_elements, perimetre, revision_id)
    SELECT now(), 'OPERATION', 'AUDIT_ETAT_INITIAL', 'CREATE', 'SUCCES', 'Système', 'MIGRATION',
           request_id, v_total,
           jsonb_build_object('migration', 'V14__audit_etat_initial', 'lignesParTable', v_detail),
           id
    FROM audit_revision WHERE id = v_rev;
END $$;

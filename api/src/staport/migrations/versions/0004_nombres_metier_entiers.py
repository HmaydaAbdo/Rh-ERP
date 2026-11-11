"""Entiers métier HALF_DOWN dans les heures supplémentaires et les jours de paie (KAN-251).

Les instantanés d'audit existants restent inchangés. Chaque ligne active modifiée est journalisée dans une nouvelle
révision MIGRATION avant que les colonnes actives passent à l'échelle 0. Les coordonnées restent décimales.

Revision ID: 0004_nombres_metier_entiers
Revises: 0003_montants_entiers
"""

from alembic import op

revision = "0004_nombres_metier_entiers"
down_revision = "0003_montants_entiers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    DO $$
    DECLARE
        v_rev BIGINT;
        v_hs INTEGER := 0;
        v_paie INTEGER := 0;
        v_request TEXT := gen_random_uuid()::text;
        v_migration CONSTANT TEXT := '0004_nombres_metier_entiers';
    BEGIN
        IF EXISTS (SELECT 1 FROM heures_supp WHERE p_h IS NOT NULL AND p_h <> trunc(p_h))
           OR EXISTS (
               SELECT 1 FROM paie
                WHERE nombre_jours_travailles <> trunc(nombre_jours_travailles)
                   OR (jours_recuperation_ouvrable IS NOT NULL
                       AND jours_recuperation_ouvrable <> trunc(jours_recuperation_ouvrable))
                   OR (jours_recuperation_dimanche IS NOT NULL
                       AND jours_recuperation_dimanche <> trunc(jours_recuperation_dimanche))
           ) THEN
        INSERT INTO audit_revision (horodatage, utilisateur_id, utilisateur_nom, origine, request_id, adresse_ip)
        VALUES (now(), NULL, 'Système', 'MIGRATION', v_request, NULL)
        RETURNING id INTO v_rev;

        WITH modifies AS (
            UPDATE heures_supp
               SET p_h = CEIL(p_h - 0.5),
                   montant = CASE WHEN s_h IS NULL THEN 0 ELSE CEIL(s_h * CEIL(p_h - 0.5) - 0.5) END,
                   stc_dh = CASE WHEN est_stc_ou_sortie
                                 THEN CASE WHEN s_h IS NULL THEN 0 ELSE CEIL(s_h * CEIL(p_h - 0.5) - 0.5) END
                                 ELSE 0 END,
                   net_a_payer = (CASE WHEN est_stc_ou_sortie THEN 0
                                       ELSE CASE WHEN s_h IS NULL THEN 0 ELSE CEIL(s_h * CEIL(p_h - 0.5) - 0.5) END END)
                                + COALESCE(forfait, 0),
                   version = version + 1
             WHERE p_h IS NOT NULL AND p_h <> CEIL(p_h - 0.5)
            RETURNING *
        )
        INSERT INTO heures_supp_aud (id, rev, revtype, employee_id, paie_id, fonction_id, chantier_id, periode,
                                     salaire_reference, type_salaire_reference, s_h, p_h, montant, est_stc_ou_sortie,
                                     stc_dh, forfait, net_a_payer)
        SELECT id, v_rev, 1, employee_id, paie_id, fonction_id, chantier_id, periode, salaire_reference,
               type_salaire_reference, s_h, p_h, montant, est_stc_ou_sortie, stc_dh, forfait, net_a_payer
        FROM modifies;
        GET DIAGNOSTICS v_hs = ROW_COUNT;

        WITH modifies AS (
            UPDATE paie
               SET nombre_jours_travailles = CEIL(nombre_jours_travailles - 0.5),
                   jours_recuperation_ouvrable = CASE WHEN jours_recuperation_ouvrable IS NULL THEN NULL
                                                      ELSE CEIL(jours_recuperation_ouvrable - 0.5) END,
                   jours_recuperation_dimanche = CASE WHEN jours_recuperation_dimanche IS NULL THEN NULL
                                                      ELSE CEIL(jours_recuperation_dimanche - 0.5) END,
                   version = version + 1
             WHERE nombre_jours_travailles <> CEIL(nombre_jours_travailles - 0.5)
                OR (jours_recuperation_ouvrable IS NOT NULL
                    AND jours_recuperation_ouvrable <> CEIL(jours_recuperation_ouvrable - 0.5))
                OR (jours_recuperation_dimanche IS NOT NULL
                    AND jours_recuperation_dimanche <> CEIL(jours_recuperation_dimanche - 0.5))
            RETURNING *
        )
        INSERT INTO paie_aud (id, rev, revtype, employee_id, periode, fonction_id, chantier_id, equipe_id,
                              nombre_jours_travailles, jours_recuperation_ouvrable, jours_recuperation_dimanche,
                              salaire_mensuel, prime_roulage_ordinaire, prime_roulage_dimanche,
                              salaire_total, observation)
        SELECT id, v_rev, 1, employee_id, periode, fonction_id, chantier_id, equipe_id, nombre_jours_travailles,
               jours_recuperation_ouvrable, jours_recuperation_dimanche, salaire_mensuel, prime_roulage_ordinaire,
               prime_roulage_dimanche, salaire_total, observation
        FROM modifies;
        GET DIAGNOSTICS v_paie = ROW_COUNT;

        IF v_hs > 0 THEN
            INSERT INTO audit_revision_entite (revision_id, entite)
            VALUES (v_rev, 'staport.rh.heuresupp.entities.HeureSupp');
            INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat,
                                       utilisateur_nom, origine,
                                       request_id, nombre_elements, perimetre, revision_id)
            VALUES (now(), 'OPERATION', 'HEURES_SUP_MODIFICATION', 'UPDATE', 'SUCCES', 'Système', 'MIGRATION',
                    v_request, v_hs, jsonb_build_object('migration', v_migration, 'regle', 'HALF_DOWN'), v_rev);
        END IF;
        IF v_paie > 0 THEN
            INSERT INTO audit_revision_entite (revision_id, entite)
            VALUES (v_rev, 'staport.rh.paie.entities.Paie');
            INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat,
                                       utilisateur_nom, origine,
                                       request_id, nombre_elements, perimetre, revision_id)
            VALUES (now(), 'OPERATION', 'PAIE_MODIFICATION', 'UPDATE', 'SUCCES', 'Système', 'MIGRATION',
                    v_request, v_paie, jsonb_build_object('migration', v_migration, 'regle', 'HALF_DOWN'), v_rev);
        END IF;
        END IF;
    END $$;
    """)
    op.execute("ALTER TABLE heures_supp ALTER COLUMN p_h TYPE NUMERIC(8, 0)")
    for column in ("nombre_jours_travailles", "jours_recuperation_ouvrable", "jours_recuperation_dimanche"):
        op.execute(f"ALTER TABLE paie ALTER COLUMN {column} TYPE NUMERIC(5, 0)")


def downgrade() -> None:
    op.execute("ALTER TABLE heures_supp ALTER COLUMN p_h TYPE NUMERIC(8, 1)")
    for column in ("nombre_jours_travailles", "jours_recuperation_ouvrable", "jours_recuperation_dimanche"):
        op.execute(f"ALTER TABLE paie ALTER COLUMN {column} TYPE NUMERIC(5, 2)")

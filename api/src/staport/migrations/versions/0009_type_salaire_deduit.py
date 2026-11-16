"""Type de salaire déduit du montant : correction des types erronés existants.

Le type n'est plus saisi : jusqu'à 500 DH c'est un salaire journalier, au-delà un salaire mensuel (règle de
`staport.domains.employee.models.type_pour`). Un type qui contredisait le montant (5 500 DH « journalier ») donnait un
salaire horaire faux dans les heures supplémentaires (550 DH/h au lieu de 21 DH/h).

La révision :
- remet en accord avec le montant le type de chaque fiche `employe` qui a un salaire ;
- recalcule, pour chaque ligne `heures_supp` dont le type de référence contredit le salaire de référence, le type, le
  S/H (arrondi à l'entier, HALF_DOWN), le montant, le STC et le net à payer.

Chaque ligne modifiée est journalisée dans une révision MIGRATION (gabarit de `conventions/database.md`). Idempotente :
sans type erroné, elle n'écrit rien. La correction de données n'est pas réversible : `downgrade` ne fait rien.

Revision ID: 0009_type_salaire_deduit
Revises: 0008_retrait_vues_libres
"""

from alembic import op

revision = "0009_type_salaire_deduit"
down_revision = "0008_retrait_vues_libres"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    DO $$
    DECLARE
        v_rev BIGINT;
        v_employes INTEGER := 0;
        v_hs INTEGER := 0;
        v_request TEXT := gen_random_uuid()::text;
        v_migration CONSTANT TEXT := '0009_type_salaire_deduit';
    BEGIN
        IF NOT EXISTS (
               SELECT 1 FROM employe
                WHERE salaire IS NOT NULL
                  AND type_salaire IS DISTINCT FROM CASE WHEN salaire <= 500 THEN 'JOURNALIER' ELSE 'MENSUEL' END
           )
           AND NOT EXISTS (
               SELECT 1 FROM heures_supp
                WHERE salaire_reference IS NOT NULL
                  AND type_salaire_reference
                      IS DISTINCT FROM CASE WHEN salaire_reference <= 500 THEN 'JOURNALIER' ELSE 'MENSUEL' END
           ) THEN
            RETURN;
        END IF;

        INSERT INTO audit_revision (horodatage, utilisateur_id, utilisateur_nom, origine, request_id, adresse_ip)
        VALUES (now(), NULL, 'Système', 'MIGRATION', v_request, NULL)
        RETURNING id INTO v_rev;

        WITH modifies AS (
            UPDATE employe
               SET type_salaire = CASE WHEN salaire <= 500 THEN 'JOURNALIER' ELSE 'MENSUEL' END,
                   version = version + 1
             WHERE salaire IS NOT NULL
               AND type_salaire IS DISTINCT FROM CASE WHEN salaire <= 500 THEN 'JOURNALIER' ELSE 'MENSUEL' END
            RETURNING *
        )
        INSERT INTO employe_aud (id, rev, revtype, nom_prenom, cin, date_naissance, date_embauche, fonction_id,
                                 chantier_id, statut, equipe_id, salaire, type_salaire)
        SELECT id, v_rev, 1, nom_prenom, cin, date_naissance, date_embauche, fonction_id, chantier_id, statut,
               equipe_id, salaire, type_salaire
        FROM modifies;
        GET DIAGNOSTICS v_employes = ROW_COUNT;

        WITH corriges AS (
            SELECT id,
                   CASE WHEN salaire_reference <= 500 THEN 'JOURNALIER' ELSE 'MENSUEL' END AS nouveau_type,
                   CEIL(salaire_reference / CASE WHEN salaire_reference <= 500 THEN 10 ELSE 260 END - 0.5) AS nouveau_sh
              FROM heures_supp
             WHERE salaire_reference IS NOT NULL
               AND type_salaire_reference
                   IS DISTINCT FROM CASE WHEN salaire_reference <= 500 THEN 'JOURNALIER' ELSE 'MENSUEL' END
        ),
        modifies AS (
            UPDATE heures_supp h
               SET type_salaire_reference = c.nouveau_type,
                   s_h = c.nouveau_sh,
                   montant = CEIL(c.nouveau_sh * h.p_h - 0.5),
                   stc_dh = CASE WHEN h.est_stc_ou_sortie THEN CEIL(c.nouveau_sh * h.p_h - 0.5) ELSE 0 END,
                   net_a_payer = (CASE WHEN h.est_stc_ou_sortie THEN 0 ELSE CEIL(c.nouveau_sh * h.p_h - 0.5) END)
                                 + COALESCE(h.forfait, 0),
                   version = h.version + 1
              FROM corriges c
             WHERE h.id = c.id
            RETURNING h.*
        )
        INSERT INTO heures_supp_aud (id, rev, revtype, employee_id, paie_id, fonction_id, chantier_id, periode,
                                     salaire_reference, type_salaire_reference, s_h, p_h, montant, est_stc_ou_sortie,
                                     stc_dh, forfait, net_a_payer)
        SELECT id, v_rev, 1, employee_id, paie_id, fonction_id, chantier_id, periode, salaire_reference,
               type_salaire_reference, s_h, p_h, montant, est_stc_ou_sortie, stc_dh, forfait, net_a_payer
        FROM modifies;
        GET DIAGNOSTICS v_hs = ROW_COUNT;

        IF v_employes > 0 THEN
            INSERT INTO audit_revision_entite (revision_id, entite)
            VALUES (v_rev, 'staport.rh.employee.entities.Employee');
            INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat,
                                       utilisateur_nom, origine, request_id, nombre_elements, perimetre, revision_id)
            VALUES (now(), 'OPERATION', 'EMPLOYE_MODIFICATION', 'UPDATE', 'SUCCES', 'Système', 'MIGRATION',
                    v_request, v_employes, jsonb_build_object('migration', v_migration, 'regle', 'TYPE_SALAIRE'),
                    v_rev);
        END IF;
        IF v_hs > 0 THEN
            INSERT INTO audit_revision_entite (revision_id, entite)
            VALUES (v_rev, 'staport.rh.heuresupp.entities.HeureSupp');
            INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat,
                                       utilisateur_nom, origine, request_id, nombre_elements, perimetre, revision_id)
            VALUES (now(), 'OPERATION', 'HEURES_SUP_MODIFICATION', 'UPDATE', 'SUCCES', 'Système', 'MIGRATION',
                    v_request, v_hs, jsonb_build_object('migration', v_migration, 'regle', 'TYPE_SALAIRE'), v_rev);
        END IF;
    END $$;
    """)


def downgrade() -> None:
    """Correction de données sans retour : les types erronés ne sont pas restaurés."""

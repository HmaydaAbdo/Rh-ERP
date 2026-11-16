"""Paramètres des vues libres de l'assistant (KAN-281, KAN-282) : interrupteur et bornes.

Valeurs de départ choisies par le propriétaire le 2026-11-16 : vues actives, code 200 Ko, exécution 15 s, 10 vues par
réponse, 60 vues par minute et par utilisateur. La révision écrit ses lignes d'audit avec le gabarit de
`conventions/database.md`.

Revision ID: 0007_parametres_vues_libres
Revises: 0006_retrait_table_suivi
"""

import sqlalchemy as sa
from alembic import op

revision = "0007_parametres_vues_libres"
down_revision = "0006_retrait_table_suivi"
branch_labels = None
depends_on = None

_CLES = (
    "ia.vues-libres.actives",
    "ia.vues-libres.taille-max.ko",
    "ia.vues-libres.duree-max.secondes",
    "ia.vues-libres.par-reponse",
    "ia.vues-libres.par-minute",
)


def upgrade() -> None:
    op.execute("""
    DO $$
    DECLARE
        v_rev BIGINT;
    BEGIN
        INSERT INTO audit_revision (horodatage, utilisateur_id, utilisateur_nom, origine, request_id, adresse_ip)
        VALUES (now(), NULL, 'Système', 'MIGRATION', gen_random_uuid()::text, NULL)
        RETURNING id INTO v_rev;

        WITH ajoutes AS (
            INSERT INTO parametre (cle, valeur) VALUES
                ('ia.vues-libres.actives', '1'),
                ('ia.vues-libres.taille-max.ko', '200'),
                ('ia.vues-libres.duree-max.secondes', '15'),
                ('ia.vues-libres.par-reponse', '10'),
                ('ia.vues-libres.par-minute', '60')
            RETURNING *
        )
        INSERT INTO parametre_aud (id, rev, revtype, cle, valeur)
        SELECT id, v_rev, 0, cle, valeur FROM ajoutes;

        INSERT INTO audit_revision_entite (revision_id, entite)
        VALUES (v_rev, 'staport.rh.parametre.entities.Parametre');

        INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                                   request_id, nombre_elements, perimetre, revision_id)
        SELECT now(), 'OPERATION', 'PARAMETRE_CREATION', 'CREATE', 'SUCCES', 'Système', 'MIGRATION',
               request_id, 5, jsonb_build_object('migration', '0007_parametres_vues_libres'), id
        FROM audit_revision WHERE id = v_rev;
    END $$;
    """)


def downgrade() -> None:
    for cle in _CLES:
        op.execute(sa.text("DELETE FROM parametre WHERE cle = :cle").bindparams(cle=cle))

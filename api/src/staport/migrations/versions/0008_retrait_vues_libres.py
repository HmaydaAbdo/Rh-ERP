"""Retrait des paramètres des vues libres de l'assistant.

Décision du propriétaire du 2026-11-16 : les vues libres sont toujours actives, sans interrupteur ni plafond (taille,
durée, nombre par réponse, fréquence par minute). Les cinq paramètres créés par la révision 0007 n'ont plus d'objet. La
révision écrit l'instantané de suppression et la ligne de journal avec le gabarit de `conventions/database.md`.

Revision ID: 0008_retrait_vues_libres
Revises: 0007_parametres_vues_libres
"""

import sqlalchemy as sa
from alembic import op

revision = "0008_retrait_vues_libres"
down_revision = "0007_parametres_vues_libres"
branch_labels = None
depends_on = None

_CLES = (
    ("ia.vues-libres.actives", "1"),
    ("ia.vues-libres.taille-max.ko", "200"),
    ("ia.vues-libres.duree-max.secondes", "15"),
    ("ia.vues-libres.par-reponse", "10"),
    ("ia.vues-libres.par-minute", "60"),
)


def upgrade() -> None:
    op.execute("""
    DO $$
    DECLARE
        v_rev BIGINT;
        v_nombre INTEGER;
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM parametre WHERE cle LIKE 'ia.vues-libres.%') THEN
            RETURN;
        END IF;

        INSERT INTO audit_revision (horodatage, utilisateur_id, utilisateur_nom, origine, request_id, adresse_ip)
        VALUES (now(), NULL, 'Système', 'MIGRATION', gen_random_uuid()::text, NULL)
        RETURNING id INTO v_rev;

        WITH retires AS (
            DELETE FROM parametre WHERE cle LIKE 'ia.vues-libres.%' RETURNING *
        )
        INSERT INTO parametre_aud (id, rev, revtype, cle, valeur)
        SELECT id, v_rev, 2, cle, valeur FROM retires;

        GET DIAGNOSTICS v_nombre = ROW_COUNT;

        INSERT INTO audit_revision_entite (revision_id, entite)
        VALUES (v_rev, 'staport.rh.parametre.entities.Parametre');

        INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                                   request_id, nombre_elements, perimetre, revision_id)
        SELECT now(), 'OPERATION', 'PARAMETRE_SUPPRESSION', 'DELETE', 'SUCCES', 'Système', 'MIGRATION',
               request_id, v_nombre, jsonb_build_object('migration', '0008_retrait_vues_libres'), id
        FROM audit_revision WHERE id = v_rev;
    END $$;
    """)


def downgrade() -> None:
    """Rétablit les valeurs de départ de la révision 0007 (sans audit : retour arrière de développement)."""
    for cle, valeur in _CLES:
        op.execute(
            sa.text(
                "INSERT INTO parametre (cle, valeur) VALUES (:cle, :valeur) ON CONFLICT (cle) DO NOTHING"
            ).bindparams(cle=cle, valeur=valeur)
        )

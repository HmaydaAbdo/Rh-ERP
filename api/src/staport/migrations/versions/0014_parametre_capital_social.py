"""Paramètre `societe.capital-social` : capital imprimé dans le pied de page des documents administratifs.

Décision du propriétaire (2026-11-27) : le capital du bandeau de pied de page de l'attestation de travail est
modifiable depuis l'écran Paramètres. Valeur de départ : celle du papier à en-tête, 70 000 000 DH. La révision écrit
ses lignes d'audit avec le gabarit de `conventions/database.md` ; une ligne déjà présente est laissée telle quelle.

Revision ID: 0014_parametre_capital_social
Revises: 0013_civilite_sans_mademoiselle
"""

from alembic import op

revision = "0014_parametre_capital_social"
down_revision = "0013_civilite_sans_mademoiselle"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    DO $$
    DECLARE
        v_rev BIGINT;
    BEGIN
        IF EXISTS (SELECT 1 FROM parametre WHERE cle = 'societe.capital-social') THEN
            RETURN;
        END IF;
        INSERT INTO audit_revision (horodatage, utilisateur_id, utilisateur_nom, origine, request_id, adresse_ip)
        VALUES (now(), NULL, 'Système', 'MIGRATION', gen_random_uuid()::text, NULL)
        RETURNING id INTO v_rev;

        WITH ajoute AS (
            INSERT INTO parametre (cle, valeur) VALUES ('societe.capital-social', '70000000')
            RETURNING *
        )
        INSERT INTO parametre_aud (id, rev, revtype, cle, valeur)
        SELECT id, v_rev, 0, cle, valeur FROM ajoute;

        INSERT INTO audit_revision_entite (revision_id, entite)
        VALUES (v_rev, 'staport.rh.parametre.entities.Parametre');

        INSERT INTO audit_journal (horodatage, categorie, action, type_operation, resultat, utilisateur_nom, origine,
                                   request_id, nombre_elements, perimetre, revision_id)
        SELECT now(), 'OPERATION', 'PARAMETRE_CREATION', 'CREATE', 'SUCCES', 'Système', 'MIGRATION',
               request_id, 1, jsonb_build_object('migration', '0014_parametre_capital_social'), id
        FROM audit_revision WHERE id = v_rev;
    END $$;
    """)


def downgrade() -> None:
    op.execute("DELETE FROM parametre WHERE cle = 'societe.capital-social'")

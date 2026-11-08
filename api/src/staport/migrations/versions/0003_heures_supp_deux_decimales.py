"""Heures supplémentaires : S/H et montants à deux décimales au lieu de l'entier de dirham (KAN-239).

Les V43 et V44 avaient réduit S/H, montant, STC, forfait et net à payer à des entiers. La règle du propriétaire est
l'arrondi automatique à deux décimales partout : les colonnes redeviennent ``NUMERIC(.,2)`` et les lignes existantes
sont recalculées à partir de leurs instantanés (salaire de référence, type de salaire, P/H), en une seule instruction
pour que les contraintes (STC = montant, net = montant - STC + forfait) restent vraies ligne par ligne. Le forfait,
saisi par l'utilisateur, n'est pas recalculé. Les tables d'audit gardent les valeurs historiques telles qu'elles étaient
enregistrées : seul le type s'élargit. ``ROUND`` de PostgreSQL arrondit « demi supérieur » comme ``arrondir_montant``.

Revision ID: 0003_heures_supp_deux_decimales
Revises: 0002_paie_materiel
"""

from alembic import op

revision = "0003_heures_supp_deux_decimales"
down_revision = "0002_paie_materiel"
branch_labels = None
depends_on = None

COLONNES = {"s_h": 10, "montant": 16, "stc_dh": 16, "forfait": 16, "net_a_payer": 16}


def _types(echelle: int) -> None:
    for table in ("heures_supp", "heures_supp_aud"):
        for colonne, precision in COLONNES.items():
            op.execute(f"ALTER TABLE {table} ALTER COLUMN {colonne} TYPE NUMERIC({precision}, {echelle})")


def upgrade() -> None:
    _types(2)
    op.execute(
        """
        UPDATE heures_supp h SET
            s_h = c.s_h,
            montant = c.montant,
            stc_dh = CASE WHEN h.est_stc_ou_sortie THEN c.montant ELSE 0 END,
            net_a_payer = c.montant - CASE WHEN h.est_stc_ou_sortie THEN c.montant ELSE 0 END + COALESCE(h.forfait, 0)
        FROM (
            SELECT id, s_h, ROUND(s_h * p_h, 2) AS montant FROM (
                SELECT id, p_h,
                    ROUND(salaire_reference / CASE type_salaire_reference WHEN 'JOURNALIER' THEN 10 ELSE 260 END, 2)
                        AS s_h
                FROM heures_supp WHERE p_h IS NOT NULL
            ) AS taux
        ) AS c
        WHERE h.id = c.id
        """
    )


def downgrade() -> None:
    """Retour aux entiers de V43/V44 (arrondi demi inférieur, comme eux), avec perte des centimes."""
    op.execute(
        """
        UPDATE heures_supp SET
            s_h = CEIL(s_h - 0.5),
            montant = CEIL(montant - 0.5),
            stc_dh = CASE WHEN est_stc_ou_sortie THEN CEIL(montant - 0.5) ELSE 0 END,
            forfait = CASE WHEN forfait IS NULL THEN NULL ELSE CEIL(forfait - 0.5) END,
            net_a_payer = CEIL(montant - 0.5) - CASE WHEN est_stc_ou_sortie THEN CEIL(montant - 0.5) ELSE 0 END
                + COALESCE(CASE WHEN forfait IS NULL THEN NULL ELSE CEIL(forfait - 0.5) END, 0)
        """
    )
    _types(0)

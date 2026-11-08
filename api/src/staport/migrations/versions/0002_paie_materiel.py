"""Mémoire du parc matériel par mois de paie (KAN-229).

Revision ID: 0002_paie_materiel
Revises: 0001_base_v44
"""

import sqlalchemy as sa
from alembic import op

revision = "0002_paie_materiel"
down_revision = "0001_base_v44"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "paie_materiel",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("periode", sa.Integer(), nullable=False),
        sa.Column("chantier_code", sa.String(50), nullable=False),
        sa.Column("equipe_code", sa.String(50), nullable=False),
        sa.Column("libelle", sa.String(100), nullable=False),
        sa.Column("quantite", sa.Integer(), nullable=False),
        sa.CheckConstraint("quantite BETWEEN 0 AND 999", name="ck_paie_materiel_quantite"),
        sa.UniqueConstraint("periode", "chantier_code", "equipe_code", "libelle", name="uq_paie_materiel"),
    )


def downgrade() -> None:
    op.drop_table("paie_materiel")

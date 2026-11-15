"""Retrait de la table de suivi obsolète.

La table `flyway_schema_history` ne sert plus : Alembic est le seul outil de migration. Une base de production
restaurée (sauvegarde du 2026-11-14, révision 0004) la porte encore ; une base neuve ne l'a jamais eue.

Revision ID: 0006_retrait_table_suivi
Revises: 0005_permission_employee_export
"""

from alembic import op

revision = "0006_retrait_table_suivi"
down_revision = "0005_permission_employee_export"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS flyway_schema_history")


def downgrade() -> None:
    """Rien à rétablir : la table n'était qu'un journal de l'ancien outil."""

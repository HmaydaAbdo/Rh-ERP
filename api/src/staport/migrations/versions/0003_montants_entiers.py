"""Tous les montants en dirhams deviennent des entiers (KAN-239, règle commune des montants).

Salaire de l'employé, bulletin de paie (salaire mensuel, primes de roulage, salaire total) et salaire de référence des
heures supplémentaires passent de ``NUMERIC(10,2)`` à ``NUMERIC(10,0)``, tables d'audit comprises. Le ``ALTER ... TYPE``
de PostgreSQL arrondit les lignes existantes à l'entier le plus proche (0,5 → 1), comme ``arrondir_montant``.
S/H, montant,
STC, forfait et net à payer des heures supplémentaires sont déjà entiers (V43 et V44) : ils ne bougent pas.
Le retour arrière ne restitue pas les centimes arrondis.

Revision ID: 0003_montants_entiers
Revises: 0002_paie_materiel
"""

from alembic import op

revision = "0003_montants_entiers"
down_revision = "0002_paie_materiel"
branch_labels = None
depends_on = None

COLONNES = {
    "employe": ["salaire"],
    "employe_aud": ["salaire"],
    "paie": ["salaire_mensuel", "prime_roulage_ordinaire", "prime_roulage_dimanche", "salaire_total"],
    "paie_aud": ["salaire_mensuel", "prime_roulage_ordinaire", "prime_roulage_dimanche", "salaire_total"],
    "heures_supp": ["salaire_reference"],
    "heures_supp_aud": ["salaire_reference"],
}


def _types(echelle: int) -> None:
    for table, colonnes in COLONNES.items():
        for colonne in colonnes:
            op.execute(f"ALTER TABLE {table} ALTER COLUMN {colonne} TYPE NUMERIC(10, {echelle})")


def upgrade() -> None:
    _types(0)


def downgrade() -> None:
    _types(2)

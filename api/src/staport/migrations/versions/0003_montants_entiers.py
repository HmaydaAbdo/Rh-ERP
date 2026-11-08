"""Tous les montants en dirhams deviennent des entiers (KAN-239, règle commune des montants).

Salaire de l'employé, bulletin de paie (salaire mensuel, primes de roulage, salaire total) et salaire de référence des
heures supplémentaires passent de ``NUMERIC(10,2)`` à ``NUMERIC(10,0)``, tables d'audit comprises. Les lignes existantes
sont arrondies par ``CEIL(x - 0.5)`` : au-delà de 0,5 on monte, jusqu'à 0,5 inclus on descend, comme
``arrondir_montant`` (le ``ALTER ... TYPE`` seul arrondirait 0,5 vers le haut).
S/H, montant, STC, forfait et net à payer des heures supplémentaires sont déjà entiers (V43 et V44) :
ils ne bougent pas.
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
            # Montants positifs : CEIL(x - 0,5) monte au-delà de 0,5 et descend jusqu'à 0,5 inclus (HALF_DOWN).
            conversion = f" USING CEIL({colonne} - 0.5)" if echelle == 0 else ""
            op.execute(f"ALTER TABLE {table} ALTER COLUMN {colonne} TYPE NUMERIC(10, {echelle}){conversion}")


def upgrade() -> None:
    _types(0)


def downgrade() -> None:
    _types(2)

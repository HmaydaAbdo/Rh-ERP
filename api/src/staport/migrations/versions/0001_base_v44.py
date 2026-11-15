"""Base : schéma et données initiales (scripts SQL V1 à V44 de `base_v44`, KAN-212).

Les 44 scripts SQL sont rejoués tels quels, dans l'ordre numérique, pour que le schéma ET les données de
référence (permissions, rôles, paramètres) soient identiques par construction. Une base de production déjà migrée
n'exécute pas cette révision. La seule substitution est `${pgaudit_enabled}` (V20), lue dans la variable
d'environnement PGAUDIT_ENABLED (faux par défaut).

Revision ID: 0001_base_v44
Revises:
"""

import os
import re
from pathlib import Path

from alembic import op

revision = "0001_base_v44"
down_revision = None
branch_labels = None
depends_on = None

DOSSIER = Path(__file__).resolve().parent.parent / "base_v44"


def _numero(chemin: Path) -> int:
    m = re.match(r"V(\d+)__", chemin.name)
    if m is None:
        raise ValueError(chemin.name)
    return int(m.group(1))


def scripts() -> list[Path]:
    return sorted(DOSSIER.glob("V*.sql"), key=_numero)


def upgrade() -> None:
    pgaudit = os.environ.get("PGAUDIT_ENABLED", "false").lower()
    if pgaudit not in ("true", "false"):
        raise ValueError("PGAUDIT_ENABLED doit valoir true ou false")
    connexion = op.get_bind().connection.dbapi_connection  # pyright: ignore[reportUnknownMemberType]
    for chemin in scripts():
        contenu = chemin.read_text(encoding="utf-8").replace("${pgaudit_enabled}", pgaudit)
        connexion.execute(contenu)  # pyright: ignore[reportUnknownMemberType,reportAttributeAccessIssue,reportOptionalMemberAccess]
        # Chaque script a sa propre transaction : certains créent des tables temporaires `ON COMMIT DROP` de même nom
        # (V9, V28, V32...) qui échouent si deux scripts partagent une transaction.
        connexion.commit()  # pyright: ignore[reportUnknownMemberType,reportAttributeAccessIssue,reportOptionalMemberAccess]


def downgrade() -> None:
    raise NotImplementedError(
        "La base V44 n'a pas de retour arrière : restaurer la sauvegarde (conventions/backup.md)."
    )

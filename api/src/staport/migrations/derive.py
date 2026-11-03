"""Périmètre du contrôle de dérive entre les modèles et la base construite par Alembic (KAN-212)."""

from typing import Any

from sqlalchemy.schema import SchemaItem

from staport.domains.auth import models as _auth  # noqa: F401  # pyright: ignore[reportUnusedImport]
from staport.platform.base_de_donnees import Base

__all__ = ["TABLES_MODELISEES", "Base", "inclure"]

# Tables modélisées par un domaine déjà migré ; s'agrandit avec chaque domaine (KAN-214 à KAN-49).
TABLES_MODELISEES = frozenset(
    {
        "permission",
        "role",
        "role_permission",
        "utilisateur",
        "utilisateur_role",
        "utilisateur_permission_refusee",
        "refresh_token",
        "reset_password_token",
    }
)


def inclure(objet: SchemaItem, nom: str | None, type_: str, reflechi: bool, comparer_a: Any) -> bool:
    if type_ == "table":
        return nom in TABLES_MODELISEES
    if type_ == "index" and nom is not None and nom.endswith("_normalise"):
        return False  # index d'unicité sur expression UPPER(BTRIM(...)) (V27), non exprimable dans le modèle
    return True

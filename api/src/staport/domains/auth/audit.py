"""Historique du domaine auth (Flyway V11) : tables `*_aud` et champs de `Permission`, `Role`, `Utilisateur`.

Un champ absent d'ici n'est jamais historisé : ni le hash du mot de passe, ni l'état de verrouillage (journalisés par
événement de sécurité), ni la version. Les noms de champs sont ceux de l'API Spring pour garder un historique continu.
"""

from typing import Any, cast

from sqlalchemy import BigInteger, Boolean, Column, ForeignKey, Index, SmallInteger, String, Table

from staport.domains.audit.api import ChampAudite, CollectionAuditee, EntiteAuditee, RelationAuditee, registre
from staport.domains.auth.models import (
    Permission,
    Role,
    Utilisateur,
    employe,
    role_permission,
    utilisateur_permission_refusee,
    utilisateur_role,
)
from staport.platform.base_de_donnees import Base


def _aud(nom: str, *colonnes: Column[Any]) -> Table:
    table = Table(
        nom,
        Base.metadata,
        Column("id", BigInteger, primary_key=True),
        Column("rev", BigInteger, ForeignKey("audit_revision.id", name=f"fk_{nom}_rev"), primary_key=True),
        Column("revtype", SmallInteger, nullable=False),
        *colonnes,
    )
    Index(f"idx_{nom}_rev", table.c.rev)
    return table


def _liaison_aud(nom: str, proprietaire: str, element: str) -> Table:
    return Table(
        nom,
        Base.metadata,
        Column("rev", BigInteger, ForeignKey("audit_revision.id", name=f"fk_{nom}_rev"), primary_key=True),
        Column("revtype", SmallInteger, nullable=False),
        Column(proprietaire, BigInteger, primary_key=True),
        Column(element, BigInteger, primary_key=True),
    )


permission_aud = _aud("permission_aud", Column("code", String(50)), Column("description", String(255)))
role_aud = _aud("role_aud", Column("nom", String(50)), Column("description", String(255)))
utilisateur_aud = _aud(
    "utilisateur_aud",
    Column("username", String(50)),
    Column("email", String(255)),
    Column("actif", Boolean),
    Column("employee_id", BigInteger),
)
role_permission_aud = _liaison_aud("role_permission_aud", "role_id", "permission_id")
utilisateur_role_aud = _liaison_aud("utilisateur_role_aud", "utilisateur_id", "role_id")
utilisateur_permission_refusee_aud = _liaison_aud(
    "utilisateur_permission_refusee_aud", "utilisateur_id", "permission_id"
)

# Table `permission`/`role` : cibles des libellés « <id> — <libellé> ».
_permission = cast(Table, Permission.__table__)
_role = cast(Table, Role.__table__)

TABLES_AUDIT = frozenset(
    {
        "permission_aud",
        "role_aud",
        "utilisateur_aud",
        "role_permission_aud",
        "utilisateur_role_aud",
        "utilisateur_permission_refusee_aud",
    }
)


def enregistrer() -> None:
    registre.enregistrer(
        EntiteAuditee(
            classe=Permission,
            nom="Permission",
            nom_hibernate="staport.rh.auth.entities.Permission",
            table_aud=permission_aud,
            champs=(
                ChampAudite("code", "code", "code"),
                ChampAudite("description", "description", "description"),
            ),
        )
    )
    registre.enregistrer(
        EntiteAuditee(
            classe=Role,
            nom="Role",
            nom_hibernate="staport.rh.auth.entities.Role",
            table_aud=role_aud,
            champs=(ChampAudite("nom", "nom", "nom"), ChampAudite("description", "description", "description")),
            collections=(
                CollectionAuditee(
                    "permissions",
                    "permissions",
                    role_permission,
                    role_permission_aud,
                    "role_id",
                    "permission_id",
                    _permission,
                ),
            ),
        )
    )
    registre.enregistrer(
        EntiteAuditee(
            classe=Utilisateur,
            nom="Utilisateur",
            nom_hibernate="staport.rh.auth.entities.Utilisateur",
            table_aud=utilisateur_aud,
            champs=(
                ChampAudite("username", "username", "username"),
                ChampAudite("email", "email", "email"),
                ChampAudite("actif", "actif", "actif"),
            ),
            relations=(RelationAuditee("employee", "employee_id", "employee_id", employe),),
            collections=(
                CollectionAuditee(
                    "roles", "roles", utilisateur_role, utilisateur_role_aud, "utilisateur_id", "role_id", _role
                ),
                CollectionAuditee(
                    "permissionsRefusees",
                    "permissions_refusees",
                    utilisateur_permission_refusee,
                    utilisateur_permission_refusee_aud,
                    "utilisateur_id",
                    "permission_id",
                    _permission,
                ),
            ),
        )
    )


enregistrer()

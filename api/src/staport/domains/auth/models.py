"""Modèles de persistance du domaine auth (KAN-213, ADR 0016 § 2).

Reflètent exactement le schéma Flyway V3 + V10/V13/V18/V21/V27. Les tables d'historique (`*_aud`) et les index
d'unicité sur expression (V27) ne sont pas modélisés : l'historique est écrit par l'écouteur d'audit (KAN-214) et les
index d'expression sont couverts par `include_object` du contrôle de dérive.
"""

from datetime import UTC, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    String,
    Table,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from staport.platform.base_de_donnees import Base, version_suivante

# Table du domaine employee, déclarée ici pour la seule clé étrangère ; son modèle complet arrive avec KAN-49.
employe = Table(
    "employe",
    Base.metadata,
    Column("id", BigInteger, primary_key=True),
    Column("nom_prenom", String(150), nullable=False),
    Column("cin", String(30), nullable=False),
)


def maintenant() -> datetime:
    """Instant courant en UTC, sans fuseau : `TIMESTAMP` des jetons (V3) est stocké en UTC."""
    return datetime.now(UTC).replace(tzinfo=None)


role_permission = Table(
    "role_permission",
    Base.metadata,
    Column("role_id", BigInteger, ForeignKey("role.id", ondelete="RESTRICT"), primary_key=True),
    Column("permission_id", BigInteger, ForeignKey("permission.id", ondelete="RESTRICT"), primary_key=True),
)

utilisateur_role = Table(
    "utilisateur_role",
    Base.metadata,
    Column("utilisateur_id", BigInteger, ForeignKey("utilisateur.id", ondelete="RESTRICT"), primary_key=True),
    Column("role_id", BigInteger, ForeignKey("role.id", ondelete="RESTRICT"), primary_key=True),
)

utilisateur_permission_refusee = Table(
    "utilisateur_permission_refusee",
    Base.metadata,
    Column("utilisateur_id", BigInteger, ForeignKey("utilisateur.id", ondelete="RESTRICT"), primary_key=True),
    Column("permission_id", BigInteger, ForeignKey("permission.id", ondelete="RESTRICT"), primary_key=True),
)


class Permission(Base):
    __tablename__ = "permission"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    version: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    __mapper_args__ = {"version_id_col": version, "version_id_generator": version_suivante}  # noqa: RUF012
    code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    description: Mapped[str] = mapped_column(String(255), nullable=False)


class Role(Base):
    __tablename__ = "role"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    version: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    __mapper_args__ = {"version_id_col": version, "version_id_generator": version_suivante}  # noqa: RUF012
    nom: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))
    permissions: Mapped[set[Permission]] = relationship(secondary=role_permission, lazy="raise")


class Utilisateur(Base):
    """Compte de connexion, indépendant de `employe` avec un lien optionnel."""

    __tablename__ = "utilisateur"
    __table_args__ = (
        CheckConstraint("nombre_echecs_connexion >= 0", name="ck_utilisateur_nombre_echecs_connexion"),
        Index("idx_utilisateur_employee", "employee_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    version: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    __mapper_args__ = {"version_id_col": version, "version_id_generator": version_suivante}  # noqa: RUF012
    username: Mapped[str] = mapped_column(String(50), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    mot_de_passe_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    actif: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    employee_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("employe.id"))
    nombre_echecs_connexion: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    derniere_echec_connexion: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    verrouillage_jusqua: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    roles: Mapped[set[Role]] = relationship(secondary=utilisateur_role, lazy="raise")
    permissions_refusees: Mapped[set[Permission]] = relationship(secondary=utilisateur_permission_refusee, lazy="raise")


class RefreshToken(Base):
    """Jeton de session opaque à usage unique ; seul son empreinte est stockée."""

    __tablename__ = "refresh_token"
    __table_args__ = (
        Index("idx_refresh_token_utilisateur", "utilisateur_id"),
        Index("idx_refresh_token_famille", "famille"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    version: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    __mapper_args__ = {"version_id_col": version, "version_id_generator": version_suivante}  # noqa: RUF012
    utilisateur_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("utilisateur.id", ondelete="CASCADE"))
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    expire_le: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoque: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    cree_le: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=maintenant)
    famille: Mapped[str] = mapped_column(String(36), nullable=False)
    utilisateur: Mapped[Utilisateur] = relationship(lazy="raise")


class ResetPasswordToken(Base):
    """Lien « mot de passe oublié » à usage unique et durée de vie courte."""

    __tablename__ = "reset_password_token"
    __table_args__ = (Index("idx_reset_password_token_utilisateur", "utilisateur_id"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    version: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    __mapper_args__ = {"version_id_col": version, "version_id_generator": version_suivante}  # noqa: RUF012
    utilisateur_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("utilisateur.id", ondelete="CASCADE"))
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    expire_le: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    utilise: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    cree_le: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=maintenant)
    utilisateur: Mapped[Utilisateur] = relationship(lazy="raise")

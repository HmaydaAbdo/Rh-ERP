"""Modèle de persistance du domaine parametre (Flyway V16 + V18 : colonne `version`)."""

from sqlalchemy import BigInteger, Identity, String
from sqlalchemy.orm import Mapped, mapped_column

from staport.platform.base_de_donnees import Base


class Parametre(Base):
    """Valeur courante d'un paramètre : `cle` est le code d'une définition du catalogue, `valeur` un texte validé."""

    __tablename__ = "parametre"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    version: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    __mapper_args__ = {"version_id_col": version}  # noqa: RUF012
    cle: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    valeur: Mapped[str] = mapped_column(String(255), nullable=False)

"""Modèle SQLAlchemy du référentiel `fonction` (parité du domaine Spring)."""

from sqlalchemy import BigInteger, Identity, String
from sqlalchemy.orm import Mapped, mapped_column

from staport.platform.base_de_donnees import Base


class Fonction(Base):
    __tablename__ = "fonction"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    version: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    __mapper_args__ = {"version_id_col": version}  # noqa: RUF012
    libelle: Mapped[str] = mapped_column(String(100), nullable=False)

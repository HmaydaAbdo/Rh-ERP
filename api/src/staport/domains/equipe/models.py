from sqlalchemy import BigInteger, Identity, String
from sqlalchemy.orm import Mapped, mapped_column

from staport.platform.base_de_donnees import Base, version_suivante


class Equipe(Base):
    __tablename__ = "equipe"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    version: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    __mapper_args__ = {"version_id_col": version, "version_id_generator": version_suivante}  # noqa: RUF012
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    libelle: Mapped[str] = mapped_column(String(100), nullable=False)

from decimal import Decimal
from enum import StrEnum

from sqlalchemy import BigInteger, Boolean, Identity, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from staport.platform.base_de_donnees import Base, version_suivante


class NatureChantier(StrEnum):
    AO = "AO"
    DEPOT = "DEPOT"
    EMULSION = "EMULSION"
    CONCASSAGE = "CONCASSAGE"
    POSTE_ENROBE = "POSTE_ENROBE"
    CENTRALE_A_BETON = "CENTRALE_A_BETON"


class Chantier(Base):
    __tablename__ = "chantier"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    version: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    __mapper_args__ = {"version_id_col": version, "version_id_generator": version_suivante}  # noqa: RUF012
    code: Mapped[str] = mapped_column(String(100), nullable=False)
    designation: Mapped[str | None] = mapped_column(String(500))
    nom: Mapped[str | None] = mapped_column(String(255))
    nature: Mapped[NatureChantier | None] = mapped_column(String(30))
    localisation: Mapped[str | None] = mapped_column(String(2048))
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(11, 8))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(11, 8))
    afficher_sur_carte: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    source_erp: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    actif: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

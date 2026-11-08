from decimal import Decimal

from sqlalchemy import BigInteger, ForeignKey, Identity, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from staport.platform.base_de_donnees import Base, version_suivante


class Paie(Base):
    __tablename__ = "paie"

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    version: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    __mapper_args__ = {"version_id_col": version, "version_id_generator": version_suivante}  # noqa: RUF012
    employee_id: Mapped[int] = mapped_column(ForeignKey("employe.id"), nullable=False)
    periode: Mapped[int] = mapped_column(Integer, nullable=False)
    fonction_id: Mapped[int] = mapped_column(ForeignKey("fonction.id"), nullable=False)
    chantier_id: Mapped[int] = mapped_column(ForeignKey("chantier.id"), nullable=False)
    equipe_id: Mapped[int | None] = mapped_column(ForeignKey("equipe.id"))
    nombre_jours_travailles: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    jours_recuperation_ouvrable: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    jours_recuperation_dimanche: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    salaire_mensuel: Mapped[Decimal] = mapped_column(Numeric(10, 0), nullable=False)
    prime_roulage_ordinaire: Mapped[Decimal | None] = mapped_column(Numeric(10, 0))
    prime_roulage_dimanche: Mapped[Decimal | None] = mapped_column(Numeric(10, 0))
    salaire_total: Mapped[Decimal] = mapped_column(Numeric(10, 0), nullable=False)
    observation: Mapped[str | None] = mapped_column(String(255))


class PaieMateriel(Base):
    """Dernier nombre saisi pour une ligne du parc matériel, mémorisé par mois de paie (KAN-229).

    Une ligne n'existe que si un nombre a été explicitement fourni pour ce mois : une ligne laissée vide ne crée ni
    n'efface rien, la valeur d'un mois antérieur reste alors celle qui est proposée.
    """

    __tablename__ = "paie_materiel"
    __table_args__ = (UniqueConstraint("periode", "chantier_code", "equipe_code", "libelle"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    periode: Mapped[int] = mapped_column(Integer, nullable=False)
    chantier_code: Mapped[str] = mapped_column(String(50), nullable=False)
    equipe_code: Mapped[str] = mapped_column(String(50), nullable=False)
    libelle: Mapped[str] = mapped_column(String(100), nullable=False)
    quantite: Mapped[int] = mapped_column(Integer, nullable=False)

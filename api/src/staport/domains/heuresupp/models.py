"""Heures supplémentaires et forfaits mensuels (Flyway V39, V43, V44 ; parité de l'entité `HeureSupp`)."""

from decimal import Decimal

from sqlalchemy import BigInteger, Boolean, ForeignKey, Identity, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from staport.platform.base_de_donnees import Base, version_suivante


class HeureSupp(Base):
    """Une ligne par employé, mois et chantier. S/H, montants et net sont entiers (dirhams) : voir `calcul`."""

    __tablename__ = "heures_supp"
    __table_args__ = (
        UniqueConstraint("employee_id", "periode", "chantier_id", name="uk_heures_supp_employee_periode_chantier"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    version: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    __mapper_args__ = {"version_id_col": version, "version_id_generator": version_suivante}  # noqa: RUF012
    employee_id: Mapped[int] = mapped_column(ForeignKey("employe.id", name="fk_heures_supp_employee"), nullable=False)
    paie_id: Mapped[int] = mapped_column(ForeignKey("paie.id", name="fk_heures_supp_paie"), nullable=False)
    fonction_id: Mapped[int] = mapped_column(ForeignKey("fonction.id", name="fk_heures_supp_fonction"), nullable=False)
    chantier_id: Mapped[int] = mapped_column(ForeignKey("chantier.id", name="fk_heures_supp_chantier"), nullable=False)
    periode: Mapped[int] = mapped_column(Integer, nullable=False)
    salaire_reference: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    type_salaire_reference: Mapped[str | None] = mapped_column(String(20))
    salaire_horaire: Mapped[Decimal | None] = mapped_column("s_h", Numeric(10, 0))
    heures: Mapped[Decimal | None] = mapped_column("p_h", Numeric(8, 1))
    montant: Mapped[Decimal] = mapped_column(Numeric(16, 0), nullable=False)
    est_stc_ou_sortie: Mapped[bool] = mapped_column(Boolean, nullable=False)
    stc_dh: Mapped[Decimal] = mapped_column(Numeric(16, 0), nullable=False)
    forfait: Mapped[Decimal | None] = mapped_column(Numeric(16, 0))
    net_a_payer: Mapped[Decimal] = mapped_column(Numeric(16, 0), nullable=False)

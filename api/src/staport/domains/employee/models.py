from datetime import date
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import BigInteger, Date, ForeignKey, Identity, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, validates

from staport.platform.base_de_donnees import Base, version_suivante


class EmployeeStatut(StrEnum):
    ACTIF = "ACTIF"
    INACTIF = "INACTIF"


class TypeSalaire(StrEnum):
    MENSUEL = "MENSUEL"
    JOURNALIER = "JOURNALIER"


SEUIL_JOURNALIER = Decimal(500)


def type_pour(salaire: Decimal) -> TypeSalaire:
    """Règle unique du type de salaire, jamais saisie par un utilisateur.

    Jusqu'à 500 DH (les journaliers vont de 80 à 200 DH) : journalier ; au-delà (les mensuels commencent à 2 500 DH) :
    mensuel. Un type qui contredit le montant donne un salaire horaire faux (5 500 DH « journalier » = 550 DH/h, au
    lieu de 21 DH/h)."""
    return TypeSalaire.JOURNALIER if salaire <= SEUIL_JOURNALIER else TypeSalaire.MENSUEL


class Employee(Base):
    __tablename__ = "employe"
    __table_args__ = {"extend_existing": True}  # noqa: RUF012
    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    version: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    __mapper_args__ = {"version_id_col": version, "version_id_generator": version_suivante}  # noqa: RUF012
    nom_prenom: Mapped[str] = mapped_column(String(150), nullable=False)
    cin: Mapped[str] = mapped_column(String(30), nullable=False)
    date_naissance: Mapped[date] = mapped_column(Date, nullable=False)
    date_embauche: Mapped[date] = mapped_column(Date, nullable=False)
    fonction_id: Mapped[int] = mapped_column(ForeignKey("fonction.id"), nullable=False)
    chantier_id: Mapped[int | None] = mapped_column(ForeignKey("chantier.id"))
    equipe_id: Mapped[int | None] = mapped_column(ForeignKey("equipe.id"))
    salaire: Mapped[Decimal | None] = mapped_column(Numeric(10, 0))
    type_salaire: Mapped[TypeSalaire | None] = mapped_column(String(20))
    statut: Mapped[EmployeeStatut] = mapped_column(String(20), nullable=False, default=EmployeeStatut.ACTIF)

    @validates("salaire")
    def _deduire_le_type(self, _cle: str, salaire: Decimal | None) -> Decimal | None:
        """Chaque écriture du salaire (saisie, import, reprise du bulletin) recalcule son type par la règle unique."""
        self.type_salaire = None if salaire is None else type_pour(salaire)
        return salaire


class EmployeeSortie(Base):
    __tablename__ = "employe_sortie"
    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    version: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    employee_id: Mapped[int] = mapped_column(ForeignKey("employe.id"), nullable=False)
    periode: Mapped[int] = mapped_column(Integer, nullable=False)
    motif: Mapped[str] = mapped_column(String(255), nullable=False)

"""Modèle SQLAlchemy du choix d'accueil de chaque utilisateur (Flyway V42, parité de `PreferenceAccueil`)."""

from sqlalchemy import BigInteger, ForeignKey, Identity, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from staport.platform.base_de_donnees import Base, version_suivante


class PreferenceAccueil(Base):
    """Codes des indicateurs à afficher, dans l'ordre, séparés par des virgules. Sans ligne : tout l'autorisé."""

    __tablename__ = "accueil_preference"
    __table_args__ = (UniqueConstraint("utilisateur_id", name="uk_accueil_preference_utilisateur"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    version: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    __mapper_args__ = {"version_id_col": version, "version_id_generator": version_suivante}  # noqa: RUF012
    utilisateur_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("utilisateur.id", name="fk_accueil_preference_utilisateur", ondelete="CASCADE"),
        nullable=False,
    )
    indicateurs: Mapped[str] = mapped_column(String(500), nullable=False)

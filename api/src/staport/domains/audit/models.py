"""Tables du domaine audit (Flyway V11, V19) : révisions, journal unique et chaîne d'intégrité.

Les colonnes `hash_precedent` et `hash_entree` sont calculées par le déclencheur `trg_audit_journal_chaine` (V19) : le
code n'y écrit jamais. Les tables `*_aud` appartiennent aux domaines dont elles historisent les entités.
"""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Column,
    DateTime,
    FetchedValue,
    ForeignKey,
    Identity,
    Index,
    Integer,
    String,
    Table,
    desc,
)
from sqlalchemy.dialects.postgresql import CHAR, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from staport.platform.base_de_donnees import Base


class RevisionAudit(Base):
    """Une révision par transaction qui modifie des données auditées ; l'identité y est figée."""

    __tablename__ = "audit_revision"
    __table_args__ = (
        CheckConstraint(
            "origine IN ('API', 'TACHE_PLANIFIEE', 'DEMARRAGE', 'MIGRATION', 'INCONNUE')",
            name="ck_audit_revision_origine",
        ),
        Index("idx_audit_revision_horodatage", desc("horodatage")),  # pyright: ignore[reportUnknownArgumentType]
        Index("idx_audit_revision_utilisateur", "utilisateur_id", "horodatage"),
        Index("idx_audit_revision_request_id", "request_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    horodatage: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    utilisateur_id: Mapped[int | None] = mapped_column(BigInteger)
    utilisateur_nom: Mapped[str] = mapped_column(String(50))
    origine: Mapped[str] = mapped_column(String(20))
    request_id: Mapped[str | None] = mapped_column(String(36))
    adresse_ip: Mapped[str | None] = mapped_column(String(45))


audit_revision_entite = Table(
    "audit_revision_entite",
    Base.metadata,
    Column(
        "revision_id",
        BigInteger,
        ForeignKey("audit_revision.id", name="fk_audit_revision_entite_revision"),
        primary_key=True,
    ),
    Column("entite", String(255), primary_key=True),
)


class EntreeJournal(Base):
    """Une entrée du journal d'audit : opération qui change l'état ou événement de sécurité. Immuable."""

    __tablename__ = "audit_journal"
    __table_args__ = (
        CheckConstraint("categorie IN ('OPERATION', 'SECURITE', 'ACCES')", name="ck_audit_journal_categorie"),
        CheckConstraint(
            "type_operation IS NULL OR type_operation IN ('CREATE', 'UPDATE', 'DELETE')",
            name="ck_audit_journal_type_operation",
        ),
        CheckConstraint("resultat IN ('SUCCES', 'ECHEC')", name="ck_audit_journal_resultat"),
        CheckConstraint(
            "origine IN ('API', 'TACHE_PLANIFIEE', 'DEMARRAGE', 'MIGRATION', 'INCONNUE')",
            name="ck_audit_journal_origine",
        ),
        Index("idx_audit_journal_horodatage", desc("horodatage")),  # pyright: ignore[reportUnknownArgumentType]
        Index("idx_audit_journal_utilisateur", "utilisateur_id", "horodatage"),
        Index("idx_audit_journal_categorie_action", "categorie", "action"),
        Index("idx_audit_journal_entite", "entite_type", "entite_id"),
        Index("idx_audit_journal_request_id", "request_id"),
        Index("idx_audit_journal_revision", "revision_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    horodatage: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    categorie: Mapped[str] = mapped_column(String(20))
    action: Mapped[str] = mapped_column(String(60))
    type_operation: Mapped[str | None] = mapped_column(String(10))
    resultat: Mapped[str] = mapped_column(String(10))
    utilisateur_id: Mapped[int | None] = mapped_column(BigInteger)
    utilisateur_nom: Mapped[str] = mapped_column(String(50))
    origine: Mapped[str] = mapped_column(String(20))
    request_id: Mapped[str | None] = mapped_column(String(36))
    adresse_ip: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(String(255))
    entite_type: Mapped[str | None] = mapped_column(String(50))
    entite_id: Mapped[int | None] = mapped_column(BigInteger)
    nombre_elements: Mapped[int | None] = mapped_column(Integer)
    perimetre: Mapped[dict[str, object] | None] = mapped_column(JSONB)
    motif: Mapped[str | None] = mapped_column(String(500))
    revision_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("audit_revision.id", name="fk_audit_journal_revision")
    )
    hash_precedent: Mapped[str] = mapped_column(CHAR(64), server_default=FetchedValue(), deferred=True)
    hash_entree: Mapped[str] = mapped_column(CHAR(64), server_default=FetchedValue(), deferred=True)

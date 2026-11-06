"""Déclaration de l'historique Envers de `fonction` pour l'écouteur d'audit Python."""

from sqlalchemy import BigInteger, Column, ForeignKey, Index, SmallInteger, String, Table

from staport.domains.audit.api import ChampAudite, EntiteAuditee, registre
from staport.platform.base_de_donnees import Base

from .models import Fonction

fonction_aud = Table(
    "fonction_aud",
    Base.metadata,
    Column("id", BigInteger, primary_key=True),
    Column("rev", BigInteger, ForeignKey("audit_revision.id", name="fk_fonction_aud_rev"), primary_key=True),
    Column("revtype", SmallInteger, nullable=False),
    Column("libelle", String(100)),
)
Index("idx_fonction_aud_rev", fonction_aud.c.rev)


def enregistrer() -> None:
    registre.enregistrer(
        EntiteAuditee(
            classe=Fonction,
            nom="Function",
            nom_hibernate="staport.rh.function.entities.Function",
            table_aud=fonction_aud,
            champs=(ChampAudite("libelle", "libelle", "libelle"),),
        )
    )


enregistrer()

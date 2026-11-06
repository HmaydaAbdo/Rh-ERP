from sqlalchemy import BigInteger, Column, ForeignKey, Index, SmallInteger, String, Table

from staport.domains.audit.api import ChampAudite, EntiteAuditee, registre
from staport.platform.base_de_donnees import Base

from .models import Equipe

equipe_aud = Table(
    "equipe_aud",
    Base.metadata,
    Column("id", BigInteger, primary_key=True),
    Column("rev", BigInteger, ForeignKey("audit_revision.id", name="fk_equipe_aud_rev"), primary_key=True),
    Column("revtype", SmallInteger, nullable=False),
    Column("code", String(50)),
    Column("libelle", String(100)),
)
Index("idx_equipe_aud_rev", equipe_aud.c.rev)


def enregistrer() -> None:
    registre.enregistrer(
        EntiteAuditee(
            classe=Equipe,
            nom="Equipe",
            nom_hibernate="staport.rh.equipe.entities.Equipe",
            table_aud=equipe_aud,
            champs=(ChampAudite("code", "code", "code"), ChampAudite("libelle", "libelle", "libelle")),
        )
    )


enregistrer()

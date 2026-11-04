"""Historique du domaine parametre (Flyway V16) : table `parametre_aud` et champs de `Parametre`.

Les noms de champs et le nom d'entité enregistré sont ceux de Spring : l'historique existant et le nouveau forment une
seule chronologie.
"""

from sqlalchemy import BigInteger, Column, ForeignKey, Index, SmallInteger, String, Table

from staport.domains.audit.api import ChampAudite, EntiteAuditee, registre
from staport.domains.parametre.models import Parametre
from staport.platform.base_de_donnees import Base

parametre_aud = Table(
    "parametre_aud",
    Base.metadata,
    Column("id", BigInteger, primary_key=True),
    Column("rev", BigInteger, ForeignKey("audit_revision.id", name="fk_parametre_aud_rev"), primary_key=True),
    Column("revtype", SmallInteger, nullable=False),
    Column("cle", String(100)),
    Column("valeur", String(255)),
)
Index("idx_parametre_aud_rev", parametre_aud.c.rev)

TABLES_AUDIT = frozenset({"parametre_aud"})


def enregistrer() -> None:
    registre.enregistrer(
        EntiteAuditee(
            classe=Parametre,
            nom="Parametre",
            nom_hibernate="staport.rh.parametre.entities.Parametre",
            table_aud=parametre_aud,
            champs=(ChampAudite("cle", "cle", "cle"), ChampAudite("valeur", "valeur", "valeur")),
        )
    )


enregistrer()

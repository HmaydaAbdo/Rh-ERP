from sqlalchemy import BigInteger, Column, ForeignKey, Index, Numeric, SmallInteger, String, Table

from staport.domains.audit.api import ChampAudite, EntiteAuditee, registre
from staport.platform.base_de_donnees import Base

from .models import Chantier

chantier_aud = Table(
    "chantier_aud",
    Base.metadata,
    Column("id", BigInteger, primary_key=True),
    Column("rev", BigInteger, ForeignKey("audit_revision.id"), primary_key=True),
    Column("revtype", SmallInteger, nullable=False),
    Column("code", String(100)),
    Column("designation", String(500)),
    Column("nom", String(255)),
    Column("source_erp", String),
    Column("actif", String),
    Column("nature", String(30)),
    Column("localisation", String(2048)),
    Column("latitude", Numeric(11, 8)),
    Column("longitude", Numeric(11, 8)),
    Column("afficher_sur_carte", String),
)
Index("idx_chantier_aud_rev", chantier_aud.c.rev)

registre.enregistrer(
    EntiteAuditee(
        classe=Chantier,
        nom="Chantier",
        nom_hibernate="staport.rh.chantier.entities.Chantier",
        table_aud=chantier_aud,
        champs=tuple(
            ChampAudite(c, c, c)
            for c in (
                "code",
                "designation",
                "nom",
                "source_erp",
                "actif",
                "nature",
                "localisation",
                "latitude",
                "longitude",
                "afficher_sur_carte",
            )
        ),
    )
)

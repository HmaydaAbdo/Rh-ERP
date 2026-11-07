"""Historique des bulletins dans la table Envers existante ``paie_aud``."""

from sqlalchemy import BigInteger, Column, ForeignKey, Index, Integer, Numeric, SmallInteger, String, Table

from staport.domains.audit.api import ChampAudite, EntiteAuditee, registre
from staport.platform.base_de_donnees import Base

from .models import Paie

paie_aud = Table(
    "paie_aud",
    Base.metadata,
    Column("id", BigInteger, primary_key=True),
    Column("rev", BigInteger, ForeignKey("audit_revision.id"), primary_key=True),
    Column("revtype", SmallInteger, nullable=False),
    Column("employee_id", BigInteger),
    Column("periode", Integer),
    Column("fonction_id", BigInteger),
    Column("chantier_id", BigInteger),
    Column("equipe_id", BigInteger),
    Column("nombre_jours_travailles", Numeric(5, 2)),
    Column("jours_recuperation_ouvrable", Numeric(5, 2)),
    Column("jours_recuperation_dimanche", Numeric(5, 2)),
    Column("salaire_mensuel", Numeric(10, 2)),
    Column("prime_roulage_ordinaire", Numeric(10, 2)),
    Column("prime_roulage_dimanche", Numeric(10, 2)),
    Column("salaire_total", Numeric(10, 2)),
    Column("observation", String(255)),
)
Index("idx_paie_aud_rev", paie_aud.c.rev)

registre.enregistrer(
    EntiteAuditee(
        classe=Paie,
        nom="Paie",
        nom_hibernate="staport.rh.paie.entities.Paie",
        table_aud=paie_aud,
        champs=tuple(
            ChampAudite(c, c, c)
            for c in (
                "employee_id",
                "periode",
                "fonction_id",
                "chantier_id",
                "equipe_id",
                "nombre_jours_travailles",
                "jours_recuperation_ouvrable",
                "jours_recuperation_dimanche",
                "salaire_mensuel",
                "prime_roulage_ordinaire",
                "prime_roulage_dimanche",
                "salaire_total",
                "observation",
            )
        ),
    )
)

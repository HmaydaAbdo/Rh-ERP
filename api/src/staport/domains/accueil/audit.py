"""Historique du domaine accueil (Flyway V42) : table `accueil_preference_aud` et champs de `PreferenceAccueil`."""

from sqlalchemy import BigInteger, Column, ForeignKey, Index, SmallInteger, String, Table

from staport.domains.audit.api import ChampAudite, EntiteAuditee, registre
from staport.platform.base_de_donnees import Base

from .models import PreferenceAccueil

accueil_preference_aud = Table(
    "accueil_preference_aud",
    Base.metadata,
    Column("id", BigInteger, primary_key=True),
    Column("rev", BigInteger, ForeignKey("audit_revision.id", name="fk_accueil_preference_aud_rev"), primary_key=True),
    Column("revtype", SmallInteger, nullable=False),
    Column("utilisateur_id", BigInteger),
    Column("indicateurs", String(500)),
)
Index("idx_accueil_preference_aud_rev", accueil_preference_aud.c.rev)


def enregistrer() -> None:
    registre.enregistrer(
        EntiteAuditee(
            classe=PreferenceAccueil,
            nom="PreferenceAccueil",
            nom_hibernate="staport.rh.accueil.entities.PreferenceAccueil",
            table_aud=accueil_preference_aud,
            champs=(
                ChampAudite("utilisateurId", "utilisateur_id", "utilisateur_id"),
                ChampAudite("indicateurs", "indicateurs", "indicateurs"),
            ),
        )
    )


enregistrer()

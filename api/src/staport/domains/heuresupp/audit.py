"""Historique des heures supplémentaires dans la table Envers existante ``heures_supp_aud``."""

from sqlalchemy import BigInteger, Boolean, Column, ForeignKey, Index, Integer, Numeric, SmallInteger, String, Table

from staport.domains.audit.api import ChampAudite, EntiteAuditee, registre
from staport.platform.base_de_donnees import Base

from .models import HeureSupp

heures_supp_aud = Table(
    "heures_supp_aud",
    Base.metadata,
    Column("id", BigInteger, primary_key=True),
    Column("rev", BigInteger, ForeignKey("audit_revision.id", name="fk_heures_supp_aud_rev"), primary_key=True),
    Column("revtype", SmallInteger, nullable=False),
    Column("employee_id", BigInteger),
    Column("paie_id", BigInteger),
    Column("fonction_id", BigInteger),
    Column("chantier_id", BigInteger),
    Column("periode", Integer),
    Column("salaire_reference", Numeric(10, 2)),
    Column("type_salaire_reference", String(20)),
    Column("s_h", Numeric(10, 0)),
    Column("p_h", Numeric(8, 1)),
    Column("montant", Numeric(16, 0)),
    Column("est_stc_ou_sortie", Boolean),
    Column("stc_dh", Numeric(16, 0)),
    Column("forfait", Numeric(16, 0)),
    Column("net_a_payer", Numeric(16, 0)),
)
Index("idx_heures_supp_aud_rev", heures_supp_aud.c.rev)

registre.enregistrer(
    EntiteAuditee(
        classe=HeureSupp,
        nom="HeureSupp",
        nom_hibernate="staport.rh.heuresupp.entities.HeureSupp",
        table_aud=heures_supp_aud,
        champs=(
            ChampAudite("employee_id", "employee_id", "employee_id"),
            ChampAudite("paie_id", "paie_id", "paie_id"),
            ChampAudite("fonction_id", "fonction_id", "fonction_id"),
            ChampAudite("chantier_id", "chantier_id", "chantier_id"),
            ChampAudite("periode", "periode", "periode"),
            ChampAudite("salaire_reference", "salaire_reference", "salaire_reference"),
            ChampAudite("type_salaire_reference", "type_salaire_reference", "type_salaire_reference"),
            ChampAudite("salaire_horaire", "salaire_horaire", "s_h"),
            ChampAudite("heures", "heures", "p_h"),
            ChampAudite("montant", "montant", "montant"),
            ChampAudite("est_stc_ou_sortie", "est_stc_ou_sortie", "est_stc_ou_sortie"),
            ChampAudite("stc_dh", "stc_dh", "stc_dh"),
            ChampAudite("forfait", "forfait", "forfait"),
            ChampAudite("net_a_payer", "net_a_payer", "net_a_payer"),
        ),
    )
)

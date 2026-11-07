from sqlalchemy import BigInteger, Column, Date, ForeignKey, Index, Numeric, SmallInteger, String, Table

from staport.domains.audit.api import ChampAudite, EntiteAuditee, registre
from staport.platform.base_de_donnees import Base

from .models import Employee

employee_aud = Table(
    "employe_aud",
    Base.metadata,
    Column("id", BigInteger, primary_key=True),
    Column("rev", BigInteger, ForeignKey("audit_revision.id"), primary_key=True),
    Column("revtype", SmallInteger, nullable=False),
    Column("nom_prenom", String(150)),
    Column("cin", String(30)),
    Column("date_naissance", Date),
    Column("date_embauche", Date),
    Column("fonction_id", BigInteger),
    Column("chantier_id", BigInteger),
    Column("equipe_id", BigInteger),
    Column("salaire", Numeric(10, 2)),
    Column("type_salaire", String(20)),
    Column("statut", String(20)),
)
Index("idx_employe_aud_rev", employee_aud.c.rev)
registre.enregistrer(
    EntiteAuditee(
        classe=Employee,
        nom="Employee",
        nom_hibernate="staport.rh.employee.entities.Employee",
        table_aud=employee_aud,
        champs=tuple(
            ChampAudite(c, c, c)
            for c in (
                "nom_prenom",
                "cin",
                "date_naissance",
                "date_embauche",
                "fonction_id",
                "chantier_id",
                "equipe_id",
                "salaire",
                "type_salaire",
                "statut",
            )
        ),
    )
)

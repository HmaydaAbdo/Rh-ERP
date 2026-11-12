"""Catalogue matériel C168 partagé par les assistants de rapport et d'export, et sa mémoire par mois (KAN-229)."""

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from .models import PaieMateriel
from .schemas import PaieMaterielTableau, PaieMaterielValeur


def tableaux_materiel() -> list[PaieMaterielTableau]:
    return [
        PaieMaterielTableau(
            chantier_code="C168",
            equipe_code="CH",
            titre="CAMION",
            libelles=["CAMION CITERNE", "CAMION 8*4", "CAMION SR", "PORT CHAR", "PICK UP"],
        ),
        PaieMaterielTableau(
            chantier_code="C168",
            equipe_code="OP",
            titre="ENGINS",
            libelles=[
                "PELLE PNEU",
                "PELLE CHENILLE",
                "NIVELEUSE",
                "COMPACTEURS",
                "CHARGEUR",
                "BULL",
                "TRACTOPELLE",
                "GRUE",
            ],
        ),
    ]


class ServiceMaterielPaie:
    """Le dernier nombre saisi pour chaque ligne du parc reste proposé aux mois suivants.

    Seul un nombre explicitement fourni est enregistré (il remplace celui du même mois) ; une ligne absente ou vide
    ne modifie rien, ni pour ce mois, ni pour les mois antérieurs.
    """

    async def memoriser(self, session: AsyncSession, periode: int, nombres: dict[str, int | None] | None) -> None:
        fournis = {
            (t.chantier_code, t.equipe_code, libelle): nombre
            for t in tableaux_materiel()
            for libelle in t.libelles
            if (nombre := (nombres or {}).get(libelle)) is not None
        }
        if not fournis:
            return
        async with session.begin():
            for (chantier, equipe, libelle), quantite in fournis.items():
                insertion = insert(PaieMateriel).values(
                    periode=periode, chantier_code=chantier, equipe_code=equipe, libelle=libelle, quantite=quantite
                )
                await session.execute(
                    insertion.on_conflict_do_update(
                        index_elements=["periode", "chantier_code", "equipe_code", "libelle"],
                        set_={"quantite": quantite},
                    )
                )

    async def valeurs(self, session: AsyncSession, periode: int) -> list[PaieMaterielValeur]:
        """Pour chaque ligne, le nombre du mois le plus récent qui ne dépasse pas ``periode``."""
        async with session.begin():
            lignes = (
                await session.execute(
                    select(PaieMateriel)
                    .where(PaieMateriel.periode <= periode)
                    .order_by(PaieMateriel.libelle, PaieMateriel.periode.desc())
                )
            ).scalars()
            retenues: dict[str, PaieMateriel] = {}
            for ligne in lignes:
                retenues.setdefault(ligne.libelle, ligne)
        return [
            PaieMaterielValeur(libelle=x.libelle, quantite=x.quantite, periode=x.periode)
            for x in sorted(retenues.values(), key=lambda x: x.libelle)
        ]

from collections.abc import Sequence

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.common.pagination import Pagination
from staport.domains.common.recherche import ECHAPPEMENT, motif_contient

from .models import Equipe
from .schemas import EquipeRecherche


async def par_id(session: AsyncSession, identifiant: int) -> Equipe | None:
    return (await session.execute(select(Equipe).where(Equipe.id == identifiant))).scalar_one_or_none()


async def existe(session: AsyncSession, code: str, libelle: str, sauf_id: int | None = None) -> tuple[bool, bool]:
    filtres = [] if sauf_id is None else [Equipe.id != sauf_id]
    code_existe = (
        await session.execute(select(func.count()).select_from(Equipe).where(Equipe.code == code, *filtres))
    ).scalar_one() > 0
    libelle_existe = (
        await session.execute(
            select(func.count()).select_from(Equipe).where(func.lower(Equipe.libelle) == libelle.lower(), *filtres)
        )
    ).scalar_one() > 0
    return code_existe, libelle_existe


async def rechercher(
    session: AsyncSession, criteres: EquipeRecherche, pagination: Pagination
) -> tuple[Sequence[Equipe], int]:
    c = criteres
    filtres: list[ColumnElement[bool]] = []
    code = c.code
    libelle = c.libelle
    recherche = c.recherche
    if code and code.strip():
        filtres.append(func.lower(Equipe.code).like(motif_contient(code), escape=ECHAPPEMENT))
    if libelle and libelle.strip():
        filtres.append(func.lower(Equipe.libelle).like(motif_contient(libelle), escape=ECHAPPEMENT))
    if recherche and recherche.strip():
        motif = motif_contient(recherche)
        filtres.append(
            or_(
                func.lower(Equipe.code).like(motif, escape=ECHAPPEMENT),
                func.lower(Equipe.libelle).like(motif, escape=ECHAPPEMENT),
            )
        )
    total = (await session.execute(select(func.count()).select_from(Equipe).where(*filtres))).scalar_one()
    requete = select(Equipe).where(*filtres)
    for champ, croissant in pagination.tri:
        colonne = getattr(Equipe, champ)
        requete = requete.order_by(colonne.asc() if croissant else colonne.desc())
    lignes = (
        (await session.execute(requete.order_by(Equipe.id.asc()).limit(pagination.taille).offset(pagination.decalage)))
        .scalars()
        .all()
    )
    return lignes, total

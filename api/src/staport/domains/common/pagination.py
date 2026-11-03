"""Pagination serveur (parité avec `Pageable` de Spring Data : `page`, `size`, `sort=champ,sens`, taille plafonnée).

Le tri n'accepte que des champs déclarés par la route : une propriété inconnue donne 400 (Spring répondait 500).
"""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Annotated

from fastapi import Query

from staport.platform.erreurs import ErreurMetier

TAILLE_MAX = 200
TAILLE_DEFAUT = 20


class TriInvalide(ErreurMetier):
    def __init__(self, propriete: str) -> None:
        super().__init__(f"Tri impossible sur la propriété : {propriete}")


@dataclass(frozen=True)
class Pagination:
    page: int
    taille: int
    tri: tuple[tuple[str, bool], ...]  # (champ, croissant)

    @property
    def decalage(self) -> int:
        return self.page * self.taille


def pagination(tri_defaut: str, autorises: frozenset[str]) -> Callable[..., Pagination]:
    """Dépendance FastAPI : `Depends(pagination("username", frozenset({...})))`."""

    def lire(
        page: Annotated[int, Query(ge=0)] = 0,
        size: Annotated[int, Query()] = TAILLE_DEFAUT,
        sort: Annotated[list[str] | None, Query()] = None,
    ) -> Pagination:
        taille = TAILLE_DEFAUT if size < 1 else min(size, TAILLE_MAX)
        criteres: list[tuple[str, bool]] = []
        for brut in sort or [tri_defaut]:
            champ, _, sens = brut.partition(",")
            champ = champ.strip()
            if champ not in autorises:
                raise TriInvalide(champ)
            criteres.append((champ, sens.strip().lower() != "desc"))
        return Pagination(page=page, taille=taille, tri=tuple(criteres))

    return lire

"""Pagination serveur (parité avec `Pageable` de Spring Data : `page`, `size`, `sort=champ,sens`, taille plafonnée).

Le tri n'accepte que des champs déclarés par la route : une propriété inconnue donne 400 (Spring répondait 500).
"""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Annotated

from fastapi import Query

from staport.platform.erreurs import ErreurMetier

TAILLE_MAX = 2000  # mesuré sur Spring (java-final) : 2000 lignes, le `max-page-size: 200` du YAML étant sans effet
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


def _entier(brut: str | None, defaut: int) -> int:
    try:
        return int(brut) if brut is not None else defaut
    except ValueError:
        return defaut


def pagination(
    tri_defaut: str,
    autorises: frozenset[str],
    *,
    taille_defaut: int = TAILLE_DEFAUT,
    tri_ignore_si_inconnu: bool = False,
) -> Callable[..., Pagination]:
    """Dépendance FastAPI : `Depends(pagination("username", frozenset({...})))`."""

    def lire(
        page: Annotated[str | None, Query()] = None,
        size: Annotated[str | None, Query()] = None,
        sort: Annotated[list[str] | None, Query()] = None,
    ) -> Pagination:
        # `PageableHandlerMethodArgumentResolver` : une page négative ou illisible vaut 0, une taille hors 1..max
        # illisible ou nulle vaut la taille par défaut, jamais une erreur.
        numero = _entier(page, 0)
        numero = 0 if numero < 0 else numero
        demande = _entier(size, taille_defaut)
        taille = taille_defaut if demande < 1 else min(demande, TAILLE_MAX)
        criteres: list[tuple[str, bool]] = []
        for brut in sort or [tri_defaut]:
            champ, _, sens = brut.partition(",")
            champ = champ.strip()
            if champ not in autorises:
                if tri_ignore_si_inconnu:  # Spring : tri de liste d'options fixe, `sort` ignoré
                    continue
                raise TriInvalide(champ)
            criteres.append((champ, sens.strip().lower() != "desc"))
        return Pagination(page=numero, taille=taille, tri=tuple(criteres) or ((tri_defaut, True),))

    return lire

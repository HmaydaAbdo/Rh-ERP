from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from decimal import Decimal
from types import SimpleNamespace as Ligne
from typing import Any, cast

import pytest
from openpyxl import load_workbook
from sqlalchemy.ext.asyncio import AsyncSession

from staport.domains.paie.export import ServiceExportPaie
from staport.domains.paie.schemas import PaieExportRequete


class SessionExport:
    def __init__(self, courant: list[tuple[Any, ...]], precedent: list[tuple[Any, ...]]) -> None:
        self._resultats = iter((courant, precedent))

    @asynccontextmanager
    async def begin(self) -> AsyncGenerator[SessionExport]:
        yield self

    async def execute(self, _requete: Any) -> Any:
        lignes = next(self._resultats)
        return Ligne(all=lambda: lignes)


def bulletin(nom: str, code_equipe: str, libelle_equipe: str, periode: int, total: str) -> tuple[Any, ...]:
    return (
        Ligne(
            periode=periode,
            fonction_id=1,
            salaire_mensuel=Decimal(total),
            salaire_total=Decimal(total),
            observation=None,
            nombre_jours_travailles=Decimal("20"),
            jours_recuperation_ouvrable=None,
            jours_recuperation_dimanche=None,
            prime_roulage_ordinaire=None,
            prime_roulage_dimanche=None,
        ),
        Ligne(nom_prenom=nom, cin=nom),
        Ligne(code="C168", nom="Chantier A"),
        Ligne(code=code_equipe, libelle=libelle_equipe),
        Ligne(libelle="Conducteur"),
    )


@pytest.mark.asyncio
async def test_excel_selection_et_exclusion_par_libelle_avec_comparaison_du_meme_perimetre() -> None:
    courant = [
        bulletin("Alice", "CH", "Chauffeurs", 202610, "1000"),
        bulletin("Bob", "OP", "Opérateurs", 202610, "2000"),
    ]
    precedent = [
        bulletin("Alice", "CH", "Chauffeurs", 202609, "900"),
        bulletin("Bob", "OP", "Opérateurs", 202609, "1800"),
    ]
    requete = PaieExportRequete(
        periode=202610,
        feuilles_equipe_mode="PERSONNALISE",
        equipes_par_chantier={"C168": ["Chauffeurs"]},
        equipes_exclues_feuille_chantier={"C168": ["Chauffeurs"]},
    )
    sortie = await ServiceExportPaie().exporter(cast(AsyncSession, SessionExport(courant, precedent)), requete)
    classeur = load_workbook(sortie, read_only=False, data_only=False)
    assert classeur.sheetnames == ["GLB", "C168", "C168_CH"]
    assert classeur["GLB"]["J7"].value == "=SUBTOTAL(9,J5:J6)"
    assert classeur["GLB"]["J8"].value == 2700
    assert classeur["GLB"]["A3"].value == "NOM & PRENOM"
    assert classeur["GLB"]["D4"].value == "P"
    assert classeur["C168"]["A5"].value == "Bob"
    assert classeur["C168"]["J7"].value == 1800
    assert classeur["C168_CH"]["A5"].value == "Alice"
    assert classeur["C168_CH"]["J7"].value == 900
    classeur.close()


@pytest.mark.asyncio
async def test_excel_materiel_reste_sur_la_feuille_equipe_concernee() -> None:
    courant = [bulletin("Alice", "CH", "Chauffeurs", 202610, "1000")]
    requete = PaieExportRequete(
        periode=202610,
        feuilles_equipe_mode="TOUTES",
        materiel={"CAMION CITERNE": 3},
    )
    sortie = await ServiceExportPaie().exporter(cast(AsyncSession, SessionExport(courant, [])), requete)
    classeur = load_workbook(sortie)
    assert classeur.sheetnames == ["GLB", "C168", "C168_CH"]
    assert classeur["GLB"]["G9"].value is None
    assert classeur["C168"]["G9"].value is None
    assert classeur["C168_CH"]["G9"].value == "CAMION"
    assert classeur["C168_CH"]["G10"].value == "CAMION CITERNE"
    assert classeur["C168_CH"]["H10"].value == 3
    classeur.close()

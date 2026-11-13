"""Rendu HTML vers PDF commun aux rapports (WeasyPrint, polices et logo du rapport de paie) et page A4 paysage."""

import asyncio
from collections.abc import Sequence
from datetime import datetime
from html import escape
from pathlib import Path
from typing import cast

CSS_PAYSAGE = Path(__file__).with_name("report") / "paysage.css"


def _rendre(html: str, base: Path) -> bytes:
    from weasyprint import HTML  # pyright: ignore[reportMissingTypeStubs]

    return cast(bytes, HTML(string=html, base_url=str(base)).write_pdf())  # pyright: ignore[reportUnknownMemberType]


async def rendre_pdf(html: str, base: Path) -> bytes:
    """Rendu hors de la boucle d'événements : il occupe le processeur le temps de la mise en page."""
    return await asyncio.to_thread(_rendre, html, base)


def css_paysage() -> str:
    """Page A4 paysage, polices, bandeau et pied répétés ; chaque rapport y ajoute ses propres tableaux."""
    return CSS_PAYSAGE.read_text(encoding="utf-8")


def entete_paysage(titre: str, contexte: str, filtres: Sequence[tuple[str, str]]) -> str:
    """Bandeau répété sur chaque page : logo, titre, contexte et filtres appliqués (un par ligne)."""
    entete = [
        '<div class="page-header"><img class="logo" src="logo-staport.png">',
        '<div class="sep s1"></div><div class="bloc b1">Ressources Humaines</div><div class="sep s2"></div>',
        f'<div class="bloc b2"><span>{escape(titre)}</span><span class="contexte">{escape(contexte)}</span></div>',
    ]
    if filtres:
        entete.append('<div class="sep s3"></div><div class="filtres">')
        entete.extend(
            f'<div><span class="lib">{escape(nom)}</span><span>{escape(valeur)}</span></div>' for nom, valeur in filtres
        )
        entete.append("</div>")
    entete.append('<div class="filet"></div></div>')
    return "".join(entete)


def pied_edition(maintenant: datetime) -> str:
    return f'<div class="pied">Édité le {maintenant:%d/%m/%Y} à {maintenant:%H:%M}</div>'

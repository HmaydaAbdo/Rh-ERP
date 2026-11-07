"""Rendu HTML vers PDF commun aux rapports (WeasyPrint, polices et logo du rapport de paie)."""

import asyncio
from pathlib import Path
from typing import cast


def _rendre(html: str, base: Path) -> bytes:
    from weasyprint import HTML  # pyright: ignore[reportMissingTypeStubs]

    return cast(bytes, HTML(string=html, base_url=str(base)).write_pdf())  # pyright: ignore[reportUnknownMemberType]


async def rendre_pdf(html: str, base: Path) -> bytes:
    """Rendu hors de la boucle d'événements : il occupe le processeur le temps de la mise en page."""
    return await asyncio.to_thread(_rendre, html, base)

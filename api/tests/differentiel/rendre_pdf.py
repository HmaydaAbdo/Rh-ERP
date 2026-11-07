"""Rend chaque PDF du dossier `sorties` en PNG côte à côte (Spring à gauche, Python à droite) pour l'œil.

uv run --with pypdfium2 python -m tests.differentiel.rendre_pdf [nom ...]
"""

import sys
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image

DOSSIER = Path(__file__).parent / "sorties"


def _pages(fichier: Path, echelle: float = 1.6) -> list[Image.Image]:
    document = pdfium.PdfDocument(str(fichier))
    return [page.render(scale=echelle).to_pil() for page in document]


def main(noms: list[str]) -> None:
    for spring in sorted(DOSSIER.glob("*.spring.pdf")):
        nom = spring.name.removesuffix(".spring.pdf")
        if noms and nom not in noms:
            continue
        python = DOSSIER / f"{nom}.python.pdf"
        if not python.exists():
            continue
        pages_s, pages_p = _pages(spring), _pages(python)
        for numero in range(max(len(pages_s), len(pages_p))):
            gauche = pages_s[numero] if numero < len(pages_s) else Image.new("RGB", (10, 10), "white")
            droite = pages_p[numero] if numero < len(pages_p) else Image.new("RGB", (10, 10), "white")
            largeur = gauche.width + droite.width + 20
            haut = max(gauche.height, droite.height)
            toile = Image.new("RGB", (largeur, haut), "#888888")
            toile.paste(gauche, (0, 0))
            toile.paste(droite, (gauche.width + 20, 0))
            toile.save(DOSSIER / f"{nom}.p{numero + 1}.png")


if __name__ == "__main__":
    main(sys.argv[1:])

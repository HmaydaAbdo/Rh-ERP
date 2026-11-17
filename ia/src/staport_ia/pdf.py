# weasyprint ne publie pas de stubs : ces règles sont levées pour ce fichier seulement.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false, reportUnknownVariableType=false
# pyright: reportUnknownArgumentType=false
"""PDF créé à la demande de l'utilisateur : Markdown (markdown-it-py) rendu en PDF par WeasyPrint, en local.

Aucun serveur de documents ne produit de PDF ; WeasyPrint est déjà celui de l'API (rapports). Le texte du modèle est du
Markdown sans HTML brut, et le rendu **refuse tout chargement externe** (image, feuille de style, police distante) :
un document ne peut donc ni lire un fichier du service ni joindre un site. Le fichier est rendu au middleware
``Bureautique`` (``bureautique.py``), qui le range dans l'espace de l'utilisateur ; il n'entre jamais dans le contexte
du modèle.
"""

import asyncio
from html import escape
from typing import Annotated, Any, cast

from langchain_core.tools import BaseTool, StructuredTool
from markdown_it import MarkdownIt
from pydantic import Field

OUTIL_PDF = "create_pdf_from_markdown"

_STYLE = """
    @page {
        size: A4; margin: 2cm;
        @bottom-right { content: counter(page) " / " counter(pages); font-size: 9pt; color: #666 }
    }
    body { font-family: sans-serif; font-size: 11pt; line-height: 1.45; color: #1a1a1a }
    h1 { font-size: 20pt; border-bottom: 2px solid #1f4e8c; padding-bottom: 4pt; color: #1f4e8c }
    h2 { font-size: 14pt; color: #1f4e8c; margin-top: 16pt }
    h3 { font-size: 12pt }
    table { border-collapse: collapse; width: 100%; margin: 8pt 0 }
    th, td { border: 1px solid #999; padding: 4pt 6pt; text-align: left }
    th { background: #e8eef7 }
    code { font-family: monospace; background: #f2f2f2 }
    """
_MARKDOWN = MarkdownIt("commonmark", {"html": False}).enable("table")


def _refuser(*_args: Any, **_kwargs: Any) -> Any:
    raise ValueError("Chargement externe refusé")


def rendre_pdf(titre: str, markdown: str) -> bytes:
    """Le PDF d'un texte Markdown ; le titre est le premier titre de la page s'il n'y en a pas déjà un."""
    # Import tardif, comme l'API : WeasyPrint charge Pango à l'import (absent d'un poste Windows sans GTK).
    from weasyprint import CSS, HTML

    titre = titre.strip()
    corps = markdown if markdown.lstrip().startswith("# ") or not titre else f"# {titre}\n\n{markdown}"
    html = (
        f"<!doctype html><html lang='fr'><meta charset='utf-8'><title>{escape(titre)}</title>"
        f"<body>{_MARKDOWN.render(corps)}</body></html>"
    )
    # Sans ``target``, WeasyPrint rend toujours les octets.
    return cast(bytes, HTML(string=html, url_fetcher=_refuser).write_pdf(stylesheets=[CSS(string=_STYLE)]))


async def _creer_pdf(
    titre: Annotated[str, Field(description="Titre du document (premier titre de la page).", max_length=200)],
    markdown_content: Annotated[
        str,
        Field(
            description=(
                "Contenu en Markdown : titres (#, ##), paragraphes, listes à puces ou numérotées, tableaux, gras. "
                "Séparer chaque bloc par une ligne vide. Pas de HTML ni d'image."
            ),
            max_length=200_000,
        ),
    ],
    file_name: Annotated[str, Field(description="Nom du fichier sans extension.", max_length=100)] = "document",
) -> tuple[str, dict[str, Any]]:
    octets = await asyncio.to_thread(rendre_pdf, titre, markdown_content)
    return "PDF créé.", {"pdf": octets, "nom": file_name}


def outil_pdf() -> BaseTool:
    """L'outil que le modèle appelle ; ``Bureautique`` range le PDF rendu en pièce du résultat (``artifact``)."""
    return StructuredTool.from_function(
        coroutine=_creer_pdf,
        name=OUTIL_PDF,
        description=(
            "Crée un document PDF à partir de texte Markdown et le met dans l'espace de fichiers de l'utilisateur. "
            "À utiliser quand l'utilisateur demande un PDF ou un document à imprimer. Les chiffres viennent des outils "
            "métier, jamais de ton calcul."
        ),
        response_format="content_and_artifact",
    )

# LangGraph, LangChain et leurs intégrations ne publient pas de stubs complets : seules ces règles sont levées, et
# seulement pour ce fichier.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false, reportUnknownVariableType=false
# pyright: reportUnknownParameterType=false, reportMissingParameterType=false, reportUnknownArgumentType=false
"""Documents Office produits à la demande de l'utilisateur, par deux serveurs MCP open source (MIT).

- **Word, PowerPoint et Excel simple** : ``mcp-ms-office-documents`` (ForLegalAI). Il écrit le fichier dans un dossier
  partagé avec ce service et répond « Document saved to <chemin> ».
- **Excel riche** (formules, mise en forme, graphiques) : ``excel-mcp-server`` (haris-musa). Il garde les classeurs dans
  son dossier de données ; ``export_workbook`` rend le classeur en base64.

Les deux serveurs sont partagés par tous les utilisateurs et ne connaissent pas l'identité : ce module la leur impose.
Un ``wrap_tool_call`` (point d'extension officiel de LangChain) préfixe chaque nom de classeur par l'identité de
l'utilisateur, intercepte le fichier produit **avant** le modèle (un classeur en base64 noierait son contexte), le range
dans l'espace de l'utilisateur (``/espace/documents/``, Store PostgreSQL) et signale la création à l'audit. Le fichier
se télécharge ensuite par la route ``/ia/fichiers`` (``fichiers.py``), avec la connexion de l'utilisateur.
"""

import base64
import binascii
import hashlib
import logging
import re
import unicodedata
import warnings
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from deepagents.backends.utils import create_file_data
from fastmcp.client import Client
from fastmcp.client.transports import StreamableHttpTransport
from langchain.agents.middleware import AgentMiddleware
from langchain.tools.tool_node import ToolCallRequest
from langchain_core.messages import ToolMessage
from langchain_core.tools import BaseTool
from langgraph.store.base import BaseStore
from langgraph.types import Command

with warnings.catch_warnings():
    warnings.simplefilter("ignore")  # langchain.mcp est publié en bêta : avertissement à l'import seulement
    from langchain.mcp import MCPAdapter

from staport_ia.agui import SIGNALEUR_ECRITURE
from staport_ia.config import Settings
from staport_ia.pdf import OUTIL_PDF, outil_pdf

journal = logging.getLogger(__name__)

#: Outils du serveur Word, PowerPoint et Excel simple exposés au modèle (ni l'e-mail ni le XML ne le sont).
OUTILS_OFFICE = (
    "create_word_from_markdown",
    "create_powerpoint_presentation",
    "list_presentation_templates",
    "create_excel_from_markdown",
)
#: Ceux qui écrivent un fichier dans le dossier partagé.
OUTILS_OFFICE_FICHIER = frozenset(
    {"create_word_from_markdown", "create_powerpoint_presentation", "create_excel_from_markdown"}
)
#: Outils d'Excel riche exposés : tous prennent un ``path`` que ce module réécrit. Ceux qui lisent ou écrivent d'autres
#: chemins du serveur (``list_workbooks``, ``import_csv``, ``export_csv``, ``insert_image``) ne sont jamais exposés.
OUTILS_EXCEL = (
    "create_workbook",
    "write_range",
    "format_range",
    "set_table",
    "create_chart",
    "add_conditional_format",
    "export_workbook",
)
OUTILS_BUREAUTIQUE = frozenset({*OUTILS_OFFICE, *OUTILS_EXCEL, OUTIL_PDF})

#: Où le fichier est rangé dans l'espace de l'utilisateur, et sa taille maximale (octets).
DOSSIER_DOCUMENTS = "/documents"
TAILLE_MAX_DOCUMENT = 25 * 1024 * 1024
FICHIERS_MAX = 50

_CHEMIN_OFFICE = re.compile(r"saved to\s+(\S+)", re.IGNORECASE)
_PREFIXE_UUID = re.compile(r"^[0-9a-f]{8}_")


async def outils_bureautique(
    url_office: str | None, url_excel: str | None, cle: str, delai_secondes: float = 60.0
) -> list[BaseTool]:
    """Les outils des deux serveurs, limités à la liste blanche. Un serveur injoignable n'ôte que ses propres outils :
    l'assistant reste utilisable (panne consignée côté serveur, sans détail)."""
    outils: list[BaseTool] = []
    for url, autorises in ((url_office, OUTILS_OFFICE), (url_excel, OUTILS_EXCEL)):
        if not url:
            continue
        transport = StreamableHttpTransport(url, headers={"Authorization": f"Bearer {cle}"})
        try:
            adaptateur = MCPAdapter(Client(transport, timeout=delai_secondes, mode="legacy"))
            outils.extend(o for o in await adaptateur.list_tools() if o.name in autorises)
        except Exception as panne:
            journal.warning("Serveur de documents indisponible : %s", type(panne).__name__)
    outils.append(outil_pdf())  # le PDF est rendu ici (``pdf.py``) : il ne dépend d'aucun serveur
    return outils


def complement_bureautique(config: Settings) -> Callable[[], Awaitable[list[BaseTool]]] | None:
    """Les outils de documents à ajouter au catalogue de chaque run, ou ``None`` quand ils ne sont pas configurés."""
    if config.bureautique_cle is None or not (config.bureautique_office_url or config.bureautique_excel_url):
        return None
    cle = config.bureautique_cle.get_secret_value()

    async def outils() -> list[BaseTool]:
        office = str(config.bureautique_office_url) if config.bureautique_office_url else None
        excel = str(config.bureautique_excel_url) if config.bureautique_excel_url else None
        return await outils_bureautique(office, excel, cle)

    return outils


def prefixe_utilisateur(utilisateur: str) -> str:
    """Un préfixe stable et sûr pour les noms de fichiers d'un utilisateur (jamais l'identité en clair)."""
    return hashlib.sha256(utilisateur.encode()).hexdigest()[:16]


def nom_sur(valeur: str, extension: str, defaut: str = "document") -> str:
    """Un nom de fichier sans dossier ni caractère spécial : seul le nom de base est gardé."""
    base = re.split(r"[\\/]", valeur.strip())[-1]
    base = re.sub(r"\.[A-Za-z0-9]{1,5}$", "", base)
    base = unicodedata.normalize("NFKD", base).encode("ascii", "ignore").decode("ascii")
    base = re.sub(r"[^A-Za-z0-9_-]+", "_", base).strip("_.-")[:60]
    return f"{base or defaut}{extension}"


def _octets(contenu: Any) -> bytes | None:
    """Le classeur d'un résultat ``export_workbook`` : le bloc ``file`` en base64."""
    blocs = contenu if isinstance(contenu, list) else []
    for bloc in blocs:
        if isinstance(bloc, dict) and bloc.get("type") == "file" and isinstance(bloc.get("base64"), str):
            try:
                return base64.b64decode(bloc["base64"], validate=True)
            except binascii.Error, ValueError:
                return None
    return None


def _message(appel: Any, contenu: str, erreur: bool = False) -> ToolMessage:
    return ToolMessage(
        content=contenu, tool_call_id=appel["id"], name=appel["name"], status="error" if erreur else "success"
    )


class Bureautique(AgentMiddleware[Any, Any, Any]):
    """Isole les fichiers par utilisateur et range ceux que produisent les serveurs de documents.

    ``dossier_office`` est le dossier que le service partage avec le serveur Word et PowerPoint ; il n'est jamais lu
    qu'à partir du chemin que ce serveur vient de rendre pour cet appel, jamais d'une valeur du modèle."""

    def __init__(self, utilisateur: str, dossier_office: str) -> None:
        super().__init__()
        self._utilisateur = utilisateur
        self._prefixe = prefixe_utilisateur(utilisateur)
        self._espace = (utilisateur, "espace")
        self._dossier = Path(dossier_office)

    async def awrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], Awaitable[ToolMessage | Command[Any]]],
    ) -> ToolMessage | Command[Any]:
        appel = request.tool_call
        nom = appel["name"]
        if nom in OUTILS_EXCEL:
            isole = request.override(tool_call={**appel, "args": self._isoler(appel["args"])})
            resultat = await handler(isole)
            if nom == "export_workbook" and isinstance(resultat, ToolMessage):
                return await self._livrer_classeur(isole, resultat)
            return resultat
        resultat = await handler(request)
        if nom in OUTILS_OFFICE_FICHIER and isinstance(resultat, ToolMessage):
            return await self._livrer_office(request, resultat)
        if nom == OUTIL_PDF and isinstance(resultat, ToolMessage):
            return await self._livrer_pdf(request, resultat)
        return resultat

    def _isoler(self, args: dict[str, Any]) -> dict[str, Any]:
        """Le classeur désigné par le modèle devient celui de cet utilisateur : un préfixe d'identité, un nom sans
        dossier. Le modèle ne peut ni sortir du dossier du serveur ni atteindre le classeur d'un autre utilisateur."""
        nom = nom_sur(str(args.get("path", "")), ".xlsx", "classeur")
        nom = nom.removeprefix(f"{self._prefixe}__")
        return {**args, "path": f"{self._prefixe}__{nom}"}

    async def _livrer_classeur(self, request: ToolCallRequest, resultat: ToolMessage) -> ToolMessage:
        appel = request.tool_call
        if resultat.status == "error":
            return resultat
        octets = _octets(resultat.content)
        if octets is None:
            return _message(appel, "Le classeur n'a pas pu être récupéré.", erreur=True)
        nom = str(appel["args"]["path"]).removeprefix(f"{self._prefixe}__")
        return await self._ranger(request, nom, octets)

    async def _livrer_pdf(self, request: ToolCallRequest, resultat: ToolMessage) -> ToolMessage:
        appel = request.tool_call
        artefact = resultat.artifact
        if resultat.status == "error" or not isinstance(artefact, dict) or not isinstance(artefact.get("pdf"), bytes):
            return resultat if resultat.status == "error" else _message(appel, "Le PDF n'a pas pu être créé.", True)
        return await self._ranger(request, nom_sur(str(artefact.get("nom", "")), ".pdf"), artefact["pdf"])

    async def _livrer_office(self, request: ToolCallRequest, resultat: ToolMessage) -> ToolMessage:
        appel = request.tool_call
        if resultat.status == "error":
            return resultat
        texte = " ".join(
            str(b.get("text", "")) if isinstance(b, dict) else str(b)
            for b in (resultat.content if isinstance(resultat.content, list) else [resultat.content])
        )
        trouve = _CHEMIN_OFFICE.search(texte)
        if trouve is None:
            return _message(appel, "Le serveur de documents n'a pas indiqué de fichier.", erreur=True)
        source = self._dossier / Path(trouve.group(1)).name  # le nom de base seulement : jamais un autre dossier
        try:
            octets = source.read_bytes()
        except OSError:
            return _message(appel, "Le fichier produit est introuvable.", erreur=True)
        message = await self._ranger(request, _PREFIXE_UUID.sub("", source.name), octets)
        try:
            source.unlink()  # le dossier partagé ne garde rien : le fichier appartient maintenant à l'utilisateur
        except OSError:
            journal.warning("Fichier produit non supprimé du dossier partagé")
        return message

    async def _ranger(self, request: ToolCallRequest, nom: str, octets: bytes) -> ToolMessage:
        """Le fichier dans l'espace de l'utilisateur, avec les bornes de taille et de nombre, puis l'audit."""
        appel = request.tool_call
        if len(octets) > TAILLE_MAX_DOCUMENT:
            return _message(
                appel, f"Fichier trop gros ({TAILLE_MAX_DOCUMENT // (1024 * 1024)} Mo au plus).", erreur=True
            )
        store: BaseStore | None = getattr(request.runtime, "store", None)
        if store is None:
            return _message(appel, "L'espace de fichiers n'est pas disponible.", erreur=True)
        cle = f"{DOSSIER_DOCUMENTS}/{nom_sur(nom, Path(nom).suffix or '.bin')}"
        existants = {item.key for item in await store.asearch(self._espace, limit=FICHIERS_MAX + 1)}
        if len(existants) >= FICHIERS_MAX and cle not in existants:
            return _message(
                appel, f"Espace plein ({FICHIERS_MAX} fichiers au plus) : supprimez-en avant d'en créer.", erreur=True
            )
        await store.aput(
            self._espace, cle, dict(create_file_data(base64.b64encode(octets).decode(), encoding="base64"))
        )
        await _signaler(f"/espace{cle}", len(octets), appel["name"])
        return _message(
            appel,
            f"Fichier prêt : {cle.rsplit('/', 1)[-1]} ({max(1, len(octets) // 1024)} Ko). Un bouton « Télécharger » "
            "s'affiche dans la discussion ; ne donne aucun chemin ni lien dans ta réponse.",
        )


async def _signaler(chemin: str, taille: int, outil: str) -> None:
    """Journalise la création dans l'audit de l'API (chemin, taille, outil ; jamais le contenu). Une panne du
    signalement n'interrompt pas le run : elle est consignée côté serveur."""
    signaleur = SIGNALEUR_ECRITURE.get()
    if signaleur is None:
        return
    try:
        await signaleur(chemin, taille, outil)
    except Exception as panne:
        journal.warning("Création de fichier non journalisée : %s", type(panne).__name__)

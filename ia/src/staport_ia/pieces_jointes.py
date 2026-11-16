"""Pièces jointes à une question de l'assistant (KAN-93).

Le navigateur envoie les fichiers dans le message de l'utilisateur (option officielle ``attachments`` de la discussion
CopilotKit, contenu AG-UI ``image`` ou ``document`` en base64) ; ``ag-ui-langgraph`` les convertit en blocs de contenu
LangChain que le modèle multimodal lit. Le navigateur n'est pas une source de confiance : chaque fichier est revérifié
ici, avant tout modèle.

1. **Déclaration** : types admis, nombre, taille, données en ligne seulement (jamais une URL : pas de SSRF).
2. **Contenu réel** : le type annoncé doit être celui que révèle la signature des octets (``puremagic``) ; un texte doit
   être de l'UTF-8 sans octet nul et sans signature de format binaire.
3. **Antivirus** : ClamAV (``clamd``, client ``aioclamd``) analyse les octets. Si l'analyse est impossible, le
   fichier est refusé (échec fermé).

Un fichier déjà accepté n'est pas réanalysé quand l'historique est renvoyé à chaque question (cache par empreinte).
"""

import base64
import binascii
import hashlib
import io
from collections import OrderedDict
from collections.abc import Sequence
from typing import Any, Protocol, cast

import puremagic
from ag_ui.core import Message, UserMessage
from fastapi import HTTPException, status

from staport_ia.documents import TYPES_OFFICE, archive_office_sure

#: Types admis : images, PDF, Office et texte (CSV, Markdown, JSON). Aucun audio, vidéo, exécutable ni archive.
TYPES_TEXTE = frozenset({"text/plain", "text/csv", "text/markdown", "application/json"})
TYPES_ADMIS = frozenset(
    {"image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"} | TYPES_TEXTE | TYPES_OFFICE
)
PIECES_MAX = 3
#: 500 Mo (décision du propriétaire) : un PDF de 500 pages, même scanné en haute définition ; le même plafond que le
#: navigateur, nginx (base64, +33 %) et clamd.
TAILLE_MAX_PIECE = 500 * 1024 * 1024
TAILLE_MAX_MESSAGE = 520 * 1024 * 1024
EMPREINTES_MAX = 256
INDISPONIBLE = "L'analyse antivirus est momentanément indisponible."


class Analyseur(Protocol):
    """L'analyse antivirus d'un fichier : lève ``PieceRefusee`` s'il est infecté ou si l'analyse est impossible."""

    async def verifier(self, donnees: bytes) -> None: ...


class PieceRefusee(Exception):
    """Un fichier refusé, avec le motif à montrer à l'utilisateur (jamais le nom du virus ni un détail technique)."""

    def __init__(self, motif: str, indisponible: bool = False) -> None:
        super().__init__(motif)
        self.motif = motif
        self.indisponible = indisponible


class AnalyseurClamd:
    """ClamAV par son protocole ``INSTREAM`` : les octets sont envoyés au démon, jamais écrits sur disque."""

    def __init__(self, hote: str, port: int = 3310, delai: float = 300.0) -> None:
        import aioclamd  # pyright: ignore[reportMissingTypeStubs]

        self._client: Any = aioclamd.ClamdAsyncClient(host=hote, port=port, timeout=delai)

    async def verifier(self, donnees: bytes) -> None:
        try:
            resultat: Any = await self._client.instream(io.BytesIO(donnees), max_size=TAILLE_MAX_PIECE)
        except Exception as panne:  # démon injoignable, trop lent ou fichier trop gros : on refuse (échec fermé)
            raise PieceRefusee(INDISPONIBLE, indisponible=True) from panne
        reponses = cast(dict[str, tuple[Any, ...]], resultat or {})
        verdict = [str(v) for valeur in reponses.values() for v in valeur if v is not None]
        if "FOUND" in verdict:
            raise PieceRefusee("Ce fichier a été bloqué par l'antivirus.")
        if "OK" not in verdict:
            raise PieceRefusee(INDISPONIBLE, indisponible=True)


class FichiersVerifies:
    """Empreintes des fichiers déjà acceptés : l'historique renvoyé à chaque question n'est pas réanalysé."""

    def __init__(self) -> None:
        self._vus: OrderedDict[str, None] = OrderedDict()

    def connu(self, empreinte: str) -> bool:
        if empreinte in self._vus:
            self._vus.move_to_end(empreinte)
            return True
        return False

    def retenir(self, empreinte: str) -> None:
        self._vus[empreinte] = None
        while len(self._vus) > EMPREINTES_MAX:
            self._vus.popitem(last=False)


def _taille_decodee(base64_texte: str) -> int:
    """Taille des octets représentés par un texte base64 (sans décoder : pas de copie en mémoire)."""
    remplissage = base64_texte.count("=", max(0, len(base64_texte) - 2))
    return len(base64_texte) * 3 // 4 - remplissage


def _refuser(motif: str, code: int = status.HTTP_422_UNPROCESSABLE_CONTENT) -> HTTPException:
    return HTTPException(code, motif)


def type_reel(donnees: bytes) -> str | None:
    """Le type que révèle la signature des octets, ou ``None`` si aucune signature connue n'est reconnue."""
    try:
        return cast(str | None, puremagic.from_string(donnees, mime=True)) or None  # pyright: ignore[reportUnknownMemberType]
    except puremagic.PureError:
        return None


def verifier_contenu(donnees: bytes, declare: str) -> None:
    """Le contenu réel correspond au type annoncé ; lève ``PieceRefusee`` sinon."""
    reel = type_reel(donnees)
    if declare in TYPES_TEXTE:
        # Un texte n'a pas de signature : s'il en a une, c'est un autre format déguisé (exécutable, archive, image…).
        if reel is not None or b"\x00" in donnees:
            raise PieceRefusee("Le contenu de ce fichier ne correspond pas à son type.")
        try:
            donnees.decode("utf-8")
        except UnicodeDecodeError as erreur:
            raise PieceRefusee("Un fichier texte doit être en UTF-8.") from erreur
        return
    if declare in TYPES_OFFICE:
        # puremagic ne distingue pas Word, Excel et PowerPoint (même archive Office) : il suffit que ce soit une archive
        # Office saine ; le format exact est validé à la lecture (MarkItDown).
        if reel not in (TYPES_OFFICE | {"application/zip"}) or not archive_office_sure(donnees):
            raise PieceRefusee("Le contenu de ce fichier ne correspond pas à son type.")
        return
    if reel != declare:
        raise PieceRefusee("Le contenu de ce fichier ne correspond pas à son type.")


async def verifier_pieces_jointes(
    messages: Sequence[Message],
    actives: bool,
    analyseur: Analyseur | None = None,
    verifies: FichiersVerifies | None = None,
) -> None:
    """422 (503 si l'analyse est indisponible) quand une pièce jointe n'est pas admise ; sans effet pour du texte."""
    for message in messages:
        if not isinstance(message, UserMessage) or isinstance(message.content, str):
            continue
        pieces: list[Any] = [p for p in message.content if getattr(p, "type", "text") != "text"]
        if not pieces:
            continue
        if not actives:
            raise _refuser("Les pièces jointes ne sont pas activées.")
        if len(pieces) > PIECES_MAX:
            raise _refuser(f"Au plus {PIECES_MAX} pièces jointes par message.")
        total = 0
        for piece in pieces:
            source = getattr(piece, "source", None)
            if getattr(piece, "type", "") not in {"image", "document"} or getattr(source, "type", "") != "data":
                raise _refuser(
                    "Pièce jointe non admise : seuls des images et des documents envoyés en ligne sont acceptés."
                )
            declare = str(getattr(source, "mime_type", "")).lower()
            if declare not in TYPES_ADMIS:
                raise _refuser(
                    "Type non admis (images, PDF, Word, Excel, PowerPoint, texte, CSV, Markdown et JSON seulement)."
                )
            texte = str(getattr(source, "value", ""))
            taille = _taille_decodee(texte)
            if taille > TAILLE_MAX_PIECE:
                raise _refuser(f"Un fichier dépasse {TAILLE_MAX_PIECE // (1024 * 1024)} Mo.")
            total += taille
            if total > TAILLE_MAX_MESSAGE:
                raise _refuser(
                    f"Les pièces jointes d'un message dépassent {TAILLE_MAX_MESSAGE // (1024 * 1024)} Mo au total."
                )
            await _verifier_fichier(texte, declare, analyseur, verifies)


async def _verifier_fichier(
    texte: str, declare: str, analyseur: Analyseur | None, verifies: FichiersVerifies | None
) -> None:
    try:
        donnees = base64.b64decode(texte, validate=True)
    except (binascii.Error, ValueError) as erreur:
        raise _refuser("Fichier illisible.") from erreur
    empreinte = hashlib.sha256(declare.encode() + b"\x00" + donnees).hexdigest()
    if verifies is not None and verifies.connu(empreinte):
        return
    if analyseur is None:
        # Pas d'antivirus configuré : aucun fichier n'est accepté (échec fermé).
        raise _refuser(INDISPONIBLE, status.HTTP_503_SERVICE_UNAVAILABLE)
    try:
        verifier_contenu(donnees, declare)
        await analyseur.verifier(donnees)
    except PieceRefusee as refus:
        code = status.HTTP_503_SERVICE_UNAVAILABLE if refus.indisponible else status.HTTP_422_UNPROCESSABLE_CONTENT
        raise _refuser(refus.motif, code) from refus
    if verifies is not None:
        verifies.retenir(empreinte)

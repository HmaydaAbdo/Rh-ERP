"""Documents joints lus par tous les modèles : PDF et fichiers Office convertis en texte (KAN-93).

La passerelle de modèles enchaîne des modèles qui ne lisent pas tous les blocs ``file`` (Mistral et GLM n'acceptent
que du texte, d'où les échecs observés avec un PDF). Le service convertit donc, après la vérification de
``pieces_jointes``, chaque PDF, document Word, classeur Excel et présentation PowerPoint en Markdown avec MarkItDown
(Microsoft, conversion locale : aucun envoi à un tiers) ; le modèle reçoit du texte, quel que soit celui qui répond.
La conversion se fait à l'appel du modèle (LectureDocuments) : le fil garde le fichier d'origine, que le navigateur
affiche comme pièce jointe.
Un fichier texte, CSV, Markdown ou JSON est décodé tel quel : le middleware de Deep Agents remplace tout bloc ``file``
non PDF par une mention « non joint » pour un modèle sans profil de lecture de fichiers (constaté avec un ``.txt``).
Un PDF sans texte (scan) reste un bloc ``file`` : seuls les modèles qui lisent les images pourront l'analyser.

Un document très long est tronqué à ``CARACTERES_MAX`` (≈ 75 000 jetons) avec une mention explicite : au-delà, aucun
modèle de la passerelle ne le lirait en une fois.
"""

import asyncio
import base64
import hashlib
import io
import zipfile
from collections import OrderedDict
from collections.abc import Awaitable, Callable, Sequence
from typing import Any, cast

from ag_ui.core import Message, TextInputContent, UserMessage
from langchain.agents.middleware import AgentMiddleware, ModelRequest, ModelResponse
from langchain_core.messages import AnyMessage, HumanMessage

#: Types convertis en texte, avec l'extension qui guide MarkItDown.
EXTENSIONS_DOCUMENT = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
}
TYPES_OFFICE = frozenset(EXTENSIONS_DOCUMENT) - {"application/pdf"}
#: Types déjà en texte : décodés tels quels, sans conversion.
TYPES_TEXTE = frozenset({"text/plain", "text/csv", "text/markdown", "application/json"})
CARACTERES_MAX = 300_000
#: Une archive Office qui se décompresserait au-delà de cette taille est refusée (bombe de décompression).
TAILLE_DECOMPRESSEE_MAX = 2 * 1024 * 1024 * 1024
TEXTES_MAX = 16


def archive_office_sure(donnees: bytes) -> bool:
    """Le fichier est une archive Office lisible dont le contenu décompressé reste raisonnable."""
    try:
        with zipfile.ZipFile(io.BytesIO(donnees)) as archive:
            return sum(fichier.file_size for fichier in archive.infolist()) <= TAILLE_DECOMPRESSEE_MAX
    except zipfile.BadZipFile:
        return False


def extraire_texte(donnees: bytes, mime: str) -> str:
    """Le document en Markdown (vide si aucun texte n'en sort) ; lève une exception si le format est illisible."""
    from markitdown import MarkItDown, StreamInfo

    resultat = MarkItDown().convert_stream(
        io.BytesIO(donnees), stream_info=StreamInfo(extension=EXTENSIONS_DOCUMENT[mime])
    )
    return resultat.text_content.strip()


class TextesExtraits:
    """Textes déjà extraits : l'historique renvoyé à chaque question ne reconvertit pas un document de 500 pages."""

    def __init__(self) -> None:
        self._textes: OrderedDict[str, str] = OrderedDict()

    def lire(self, empreinte: str) -> str | None:
        texte = self._textes.get(empreinte)
        if texte is not None:
            self._textes.move_to_end(empreinte)
        return texte

    def retenir(self, empreinte: str, texte: str) -> None:
        self._textes[empreinte] = texte
        while len(self._textes) > TEXTES_MAX:
            self._textes.popitem(last=False)


def _mention(texte: str) -> str:
    if len(texte) <= CARACTERES_MAX:
        return texte
    return texte[
        :CARACTERES_MAX
    ] + "\n\n[Document tronqué : seuls les {} premiers caractères sur {} sont fournis.]".format(
        f"{CARACTERES_MAX:,}".replace(",", " "), f"{len(texte):,}".replace(",", " ")
    )


#: Cache commun à la vérification des pièces jointes (agui.py) et à la lecture par le modèle (``LectureDocuments``).
TEXTES = TextesExtraits()


async def texte_document(mime: str, valeur: str, textes: TextesExtraits) -> str:
    """Le texte d'un document en base64 (vide pour un PDF scanné) ; lève une exception si le format est illisible."""
    empreinte = hashlib.sha256(mime.encode() + b"\x00" + valeur.encode()).hexdigest()
    texte = textes.lire(empreinte)
    if texte is None:
        donnees = base64.b64decode(valeur)
        if mime in TYPES_TEXTE:  # texte, CSV, Markdown, JSON : déjà du texte, aucun bloc ``file`` pour le modèle
            texte = donnees.decode("utf-8", errors="replace").strip()
        else:
            texte = await asyncio.to_thread(extraire_texte, donnees, mime)
        textes.retenir(empreinte, texte)
    return texte


def _lisible(mime: str) -> bool:
    return mime in EXTENSIONS_DOCUMENT or mime in TYPES_TEXTE


class LectureDocuments(AgentMiddleware[Any, Any]):
    """Le modèle reçoit le texte des documents joints ; l'état du fil garde le fichier d'origine.

    Le navigateur affiche ainsi une pièce jointe (et non le contenu converti) dans la bulle de l'utilisateur, au moment
    de l'envoi comme à la réouverture de la conversation. Le middleware est placé avant celui de Deep Agents qui
    remplace tout bloc ``file`` non PDF.
    """

    def __init__(self, textes: TextesExtraits = TEXTES) -> None:
        super().__init__()
        self._textes = textes

    async def awrap_model_call(
        self,
        request: ModelRequest[Any],
        handler: Callable[[ModelRequest[Any]], Awaitable[ModelResponse[Any]]],
    ) -> ModelResponse[Any]:
        messages = [await self._lire(message) for message in request.messages]
        return await handler(request.override(messages=messages))

    async def _lire(self, message: AnyMessage) -> AnyMessage:
        if not isinstance(message, HumanMessage) or not isinstance(message.content, list):
            return message
        contenu: list[Any] = []
        modifie = False
        for bloc in message.content:
            texte = await self._texte(bloc)
            if texte is None:
                contenu.append(bloc)
                continue
            modifie = True
            contenu.append({"type": "text", "text": f"[Contenu du document joint]\n\n{_mention(texte)}"})
        return message.model_copy(update={"content": contenu}) if modifie else message

    async def _texte(self, bloc: Any) -> str | None:
        if not isinstance(bloc, dict):
            return None
        champs = cast(dict[str, Any], bloc)
        if champs.get("type") != "file":
            return None
        mime = str(champs.get("mime_type", "")).lower()
        valeur = champs.get("base64") or champs.get("data")
        if not _lisible(mime) or not isinstance(valeur, str):
            return None
        return await texte_document(mime, valeur, self._textes) or None  # PDF scanné : le bloc d'origine est gardé


async def convertir_documents(messages: Sequence[Message], textes: TextesExtraits) -> list[Message]:
    """Les messages dont les documents (PDF avec texte, Word, Excel, PowerPoint) sont remplacés par leur texte."""
    resultat: list[Message] = []
    for message in messages:
        if not isinstance(message, UserMessage) or isinstance(message.content, str):
            resultat.append(message)
            continue
        contenu: list[Any] = []
        for partie in message.content:
            source = getattr(partie, "source", None)
            mime = str(getattr(source, "mime_type", "")).lower()
            if getattr(partie, "type", "") != "document" or (
                mime not in EXTENSIONS_DOCUMENT and mime not in TYPES_TEXTE
            ):
                contenu.append(partie)
                continue
            texte = await texte_document(mime, str(getattr(source, "value", "")), textes)
            if not texte:
                contenu.append(
                    partie
                )  # PDF scanné : le bloc d'origine est gardé pour les modèles qui lisent les images
                continue
            contenu.append(TextInputContent(type="text", text=f"[Contenu du document joint]\n\n{_mention(texte)}"))
        resultat.append(message.model_copy(update={"content": contenu}))
    return resultat

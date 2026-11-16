"""Documents joints lus par tous les modèles : PDF et fichiers Office convertis en texte (KAN-93).

La passerelle de modèles enchaîne des modèles qui ne lisent pas tous les blocs ``file`` (Mistral et GLM n'acceptent
que du texte, d'où les échecs observés avec un PDF). Le service convertit donc, après la vérification de
``pieces_jointes``, chaque PDF, document Word, classeur Excel et présentation PowerPoint en Markdown avec MarkItDown
(Microsoft, conversion locale : aucun envoi à un tiers) ; le modèle reçoit du texte, quel que soit celui qui répond.
Un PDF sans texte (scan) reste un bloc ``file`` : seuls les modèles qui lisent les images pourront l'analyser.

Un document très long est tronqué à ``CARACTERES_MAX`` (≈ 75 000 jetons) avec une mention explicite : au-delà, aucun
modèle de la passerelle ne le lirait en une fois.
"""

import asyncio
import hashlib
import io
import zipfile
from collections import OrderedDict
from collections.abc import Sequence
from typing import Any

from ag_ui.core import Message, TextInputContent, UserMessage

#: Types convertis en texte, avec l'extension qui guide MarkItDown.
EXTENSIONS_DOCUMENT = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
}
TYPES_OFFICE = frozenset(EXTENSIONS_DOCUMENT) - {"application/pdf"}
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
            if getattr(partie, "type", "") != "document" or mime not in EXTENSIONS_DOCUMENT:
                contenu.append(partie)
                continue
            valeur = str(getattr(source, "value", ""))
            empreinte = hashlib.sha256(mime.encode() + b"\x00" + valeur.encode()).hexdigest()
            texte = textes.lire(empreinte)
            if texte is None:
                import base64

                donnees = base64.b64decode(valeur)
                texte = await asyncio.to_thread(extraire_texte, donnees, mime)
                textes.retenir(empreinte, texte)
            if not texte:
                contenu.append(
                    partie
                )  # PDF scanné : le bloc d'origine est gardé pour les modèles qui lisent les images
                continue
            contenu.append(TextInputContent(type="text", text=f"[Contenu du document joint]\n\n{_mention(texte)}"))
        resultat.append(message.model_copy(update={"content": contenu}))
    return resultat

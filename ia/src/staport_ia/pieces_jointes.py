"""Pièces jointes à une question de l'assistant (KAN-93, prototype désactivé par défaut).

Le navigateur envoie les fichiers dans le message de l'utilisateur (option officielle ``attachments`` de la discussion
CopilotKit, contenu AG-UI ``image`` ou ``document`` en base64) ; ``ag-ui-langgraph`` les convertit en blocs de contenu
LangChain que le modèle multimodal lit. Le navigateur n'est pas une source de confiance : les types, le nombre et la
taille sont revérifiés ici, avant tout modèle. Seules des données en ligne sont admises (jamais une URL ni un
identifiant de fichier : le serveur n'ira rien chercher, pas de SSRF), et rien n'est conservé hors du fil.
"""

from collections.abc import Sequence
from typing import Any

from ag_ui.core import Message, UserMessage
from fastapi import HTTPException, status

#: Types admis : images, PDF et texte brut (CSV compris). Aucun audio, vidéo ni fichier exécutable ou archive.
TYPES_ADMIS = frozenset(
    {"image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf", "text/plain", "text/csv"}
)
PIECES_MAX = 3
TAILLE_MAX_PIECE = 10 * 1024 * 1024
TAILLE_MAX_MESSAGE = 12 * 1024 * 1024


def _taille_decodee(base64: str) -> int:
    """Taille des octets représentés par un texte base64 (sans décoder : pas de copie en mémoire)."""
    remplissage = base64.count("=", max(0, len(base64) - 2))
    return len(base64) * 3 // 4 - remplissage


def _refuser(motif: str) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, motif)


def verifier_pieces_jointes(messages: Sequence[Message], actives: bool) -> None:
    """422 si un message de l'utilisateur porte une pièce jointe non admise ; sans effet pour du texte seul."""
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
            if str(getattr(source, "mime_type", "")).lower() not in TYPES_ADMIS:
                raise _refuser("Type de fichier non admis (images, PDF, texte et CSV seulement).")
            taille = _taille_decodee(str(getattr(source, "value", "")))
            if taille > TAILLE_MAX_PIECE:
                raise _refuser(f"Un fichier dépasse {TAILLE_MAX_PIECE // (1024 * 1024)} Mo.")
            total += taille
        if total > TAILLE_MAX_MESSAGE:
            raise _refuser(
                f"Les pièces jointes d'un message dépassent {TAILLE_MAX_MESSAGE // (1024 * 1024)} Mo au total."
            )

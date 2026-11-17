"""Conversion des documents joints en texte (KAN-93) : Word, Excel, PowerPoint et PDF lisibles par tous les modèles."""

import asyncio
import base64
import io
import zipfile

import openpyxl
import pytest
from ag_ui.core import DocumentInputContent, TextInputContent, UserMessage
from pptx import Presentation

from staport_ia.documents import (
    CARACTERES_MAX,
    TextesExtraits,
    archive_office_sure,
    convertir_documents,
    extraire_texte,
)
from staport_ia.pieces_jointes import PieceRefusee, verifier_contenu

DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation"


def _docx(texte: str = "Bonjour test Word") -> bytes:
    contenu = io.BytesIO()
    with zipfile.ZipFile(contenu, "w") as archive:
        archive.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.'
            'wordprocessingml.document.main+xml"/></Types>',
        )
        archive.writestr(
            "_rels/.rels",
            '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
            'officeDocument" Target="word/document.xml"/></Relationships>',
        )
        archive.writestr(
            "word/document.xml",
            '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            f"<w:body><w:p><w:r><w:t>{texte}</w:t></w:r></w:p></w:body></w:document>",
        )
    return contenu.getvalue()


def _xlsx() -> bytes:
    contenu = io.BytesIO()
    classeur = openpyxl.Workbook()
    classeur.active.append(["matricule", "nom"])  # pyright: ignore[reportOptionalMemberAccess]
    classeur.active.append([12, "Alami"])  # pyright: ignore[reportOptionalMemberAccess]
    classeur.save(contenu)
    return contenu.getvalue()


def _pptx() -> bytes:
    contenu = io.BytesIO()
    presentation = Presentation()
    diapo = presentation.slides.add_slide(presentation.slide_layouts[0])
    diapo.shapes.title.text = "Bilan social"  # pyright: ignore[reportOptionalMemberAccess]
    presentation.save(contenu)
    return contenu.getvalue()


@pytest.mark.parametrize(
    ("donnees", "mime", "attendu"),
    [(_docx(), DOCX, "Bonjour test Word"), (_xlsx(), XLSX, "Alami"), (_pptx(), PPTX, "Bilan social")],
)
def test_word_excel_et_powerpoint_sont_convertis_en_texte(donnees: bytes, mime: str, attendu: str) -> None:
    assert attendu in extraire_texte(donnees, mime)


@pytest.mark.parametrize(("donnees", "mime"), [(_docx(), DOCX), (_xlsx(), XLSX), (_pptx(), PPTX)])
def test_une_archive_office_saine_est_acceptee_quel_que_soit_son_format(donnees: bytes, mime: str) -> None:
    verifier_contenu(donnees, mime)  # ne lève rien


def test_un_faux_fichier_office_est_refuse() -> None:
    with pytest.raises(PieceRefusee):
        verifier_contenu(b"MZ\x90\x00 pas un document", DOCX)
    assert archive_office_sure(b"pas une archive") is False


def _message(donnees: bytes, mime: str) -> UserMessage:
    valeur = base64.b64encode(donnees).decode()
    document = DocumentInputContent.model_validate(
        {"type": "document", "source": {"type": "data", "value": valeur, "mimeType": mime}}
    )
    return UserMessage(id="m1", role="user", content=[TextInputContent(type="text", text="Résume"), document])


def test_le_document_est_remplace_par_son_texte_et_garde_en_cache() -> None:
    textes = TextesExtraits()
    message = _message(_docx("Contenu confidentiel du contrat"), DOCX)

    resultat = asyncio.run(convertir_documents([message], textes))
    contenu = resultat[0].content
    assert isinstance(contenu, list)
    assert [partie.type for partie in contenu] == ["text", "text"]
    assert "Contenu confidentiel du contrat" in str(getattr(contenu[1], "text", ""))

    # Même document renvoyé avec l'historique : lu depuis le cache, sans nouvelle extraction.
    assert len(textes._textes) == 1  # pyright: ignore[reportPrivateUsage]
    asyncio.run(convertir_documents([message], textes))
    assert len(textes._textes) == 1  # pyright: ignore[reportPrivateUsage]


@pytest.mark.parametrize("mime", ["text/plain", "text/csv", "text/markdown", "application/json"])
def test_un_fichier_texte_arrive_au_modele_comme_du_texte(mime: str) -> None:
    """Un ``.txt`` restait un bloc ``file`` que Deep Agents remplace par « non joint » : le modèle ne lisait rien."""
    message = _message("Retard du ciment : 2 jours, responsable Karim.\né accentué".encode(), mime)
    contenu = asyncio.run(convertir_documents([message], TextesExtraits()))[0].content
    assert isinstance(contenu, list)
    assert [partie.type for partie in contenu] == ["text", "text"]
    assert "responsable Karim" in str(getattr(contenu[1], "text", ""))
    assert "é accentué" in str(getattr(contenu[1], "text", ""))


def test_un_fichier_texte_vide_reste_un_document() -> None:
    contenu = asyncio.run(convertir_documents([_message(b"  \n", "text/plain")], TextesExtraits()))[0].content
    assert isinstance(contenu, list)
    assert [partie.type for partie in contenu] == ["text", "document"]


def test_un_document_tres_long_est_tronque_avec_une_mention(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("staport_ia.documents.CARACTERES_MAX", 50)
    resultat = asyncio.run(convertir_documents([_message(_docx("x" * 500), DOCX)], TextesExtraits()))
    contenu = resultat[0].content
    assert isinstance(contenu, list)
    texte = str(getattr(contenu[1], "text", ""))
    assert "Document tronqué" in texte
    assert CARACTERES_MAX > 50

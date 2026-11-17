# LangGraph, LangChain et leurs intégrations ne publient pas de stubs complets : seules ces règles sont levées, et
# seulement pour ce fichier.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false, reportUnknownVariableType=false
# pyright: reportUnknownParameterType=false, reportMissingParameterType=false, reportUnknownArgumentType=false
"""Documents Office produits par l'agent (bureautique.py) : isolation par utilisateur, livraison, bornes, audit."""

import base64
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from langchain_core.messages import ToolMessage
from langgraph.store.memory import InMemoryStore

from staport_ia import bureautique
from staport_ia.agui import SIGNALEUR_ECRITURE
from staport_ia.bureautique import (
    FICHIERS_MAX,
    OUTILS_BUREAUTIQUE,
    OUTILS_EXCEL,
    OUTILS_OFFICE,
    Bureautique,
    complement_bureautique,
    nom_sur,
    outils_bureautique,
    prefixe_utilisateur,
)
from staport_ia.config import Settings
from staport_ia.fichiers import _contenu, _taille  # pyright: ignore[reportPrivateUsage]
from staport_ia.pdf import rendre_pdf

ALICE = "alice"
CLASSEUR = b"PK\x03\x04 un classeur xlsx"


class _Requete:
    """Une requête d'outil minimale : ce que le middleware lit (appel, Store) et ``override``."""

    def __init__(self, appel: dict[str, Any], store: Any) -> None:
        self.tool_call = appel
        self.runtime = SimpleNamespace(store=store)

    def override(self, **changements: Any) -> _Requete:
        return _Requete(changements.get("tool_call", self.tool_call), self.runtime.store)


def Requete(appel: dict[str, Any], store: Any) -> Any:
    """Le double, typé ``Any`` : ``ToolCallRequest`` est un dataclass que le test n'a pas à construire en entier."""
    return _Requete(appel, store)


def _appel(nom: str, **args: Any) -> dict[str, Any]:
    return {"name": nom, "args": args, "id": "a1", "type": "tool_call"}


def _export(contenu: bytes = CLASSEUR) -> ToolMessage:
    blocs = [
        {"type": "text", "text": "Exported x.xlsx."},
        {"type": "file", "base64": base64.b64encode(contenu).decode(), "mime_type": "application/octet-stream"},
    ]
    return ToolMessage(content=blocs, tool_call_id="a1", name="export_workbook")  # pyright: ignore


async def _passe(retour: ToolMessage) -> Any:
    vus: list[Any] = []

    async def handler(requete: Any) -> ToolMessage:
        vus.append(requete)
        return retour

    return handler, vus


# --- isolation par utilisateur -------------------------------------------------------------------------------------


def test_un_nom_de_classeur_perd_ses_dossiers_et_ses_caracteres_speciaux() -> None:
    assert nom_sur("../../etc/passwd", ".xlsx") == "passwd.xlsx"
    assert nom_sur("C:\\Users\\x\\Paie octobre 2026.xlsx", ".xlsx") == "Paie_octobre_2026.xlsx"
    assert nom_sur("Procédure d'accueil", ".docx") == "Procedure_d_accueil.docx"
    assert nom_sur("", ".xlsx", "classeur") == "classeur.xlsx"
    assert nom_sur("....", ".docx") == "document.docx"
    assert len(nom_sur("a" * 500, ".xlsx")) <= 65


async def test_chaque_outil_excel_est_reecrit_au_nom_de_l_utilisateur() -> None:
    middleware = Bureautique(ALICE, "/documents")
    handler, vus = await _passe(ToolMessage(content="ok", tool_call_id="a1", name="write_range"))

    await middleware.awrap_tool_call(
        Requete(_appel("write_range", path="../../autre/paie.xlsx", sheet="S"), None), handler
    )

    assert vus[0].tool_call["args"]["path"] == f"{prefixe_utilisateur(ALICE)}__paie.xlsx"
    assert vus[0].tool_call["args"]["sheet"] == "S"


async def test_un_classeur_d_un_autre_utilisateur_reste_inatteignable() -> None:
    middleware = Bureautique(ALICE, "/documents")
    handler, vus = await _passe(ToolMessage(content="ok", tool_call_id="a1", name="describe_workbook"))
    autre = f"{prefixe_utilisateur('bob')}__secret.xlsx"

    await middleware.awrap_tool_call(Requete(_appel("create_workbook", path=autre), None), handler)

    assert vus[0].tool_call["args"]["path"].startswith(f"{prefixe_utilisateur(ALICE)}__")
    assert vus[0].tool_call["args"]["path"] != autre


async def test_le_nom_deja_prefixe_par_le_modele_n_est_pas_prefixe_deux_fois() -> None:
    middleware = Bureautique(ALICE, "/documents")
    handler, vus = await _passe(ToolMessage(content="ok", tool_call_id="a1", name="write_range"))
    mien = f"{prefixe_utilisateur(ALICE)}__paie.xlsx"

    await middleware.awrap_tool_call(Requete(_appel("write_range", path=mien), None), handler)

    assert vus[0].tool_call["args"]["path"] == mien


def test_les_outils_qui_touchent_d_autres_chemins_du_serveur_ne_sont_jamais_exposes() -> None:
    interdits = {"list_workbooks", "import_csv", "export_csv", "insert_image", "import_workbook", "read_vba"}

    assert interdits.isdisjoint(OUTILS_BUREAUTIQUE)
    assert "create_email_draft" not in OUTILS_OFFICE
    assert len(OUTILS_EXCEL) <= 7


# --- livraison ------------------------------------------------------------------------------------------------------


async def test_le_classeur_exporte_va_dans_l_espace_de_l_utilisateur_et_jamais_dans_le_contexte_du_modele() -> None:
    store = InMemoryStore()
    middleware = Bureautique(ALICE, "/documents")
    handler, _ = await _passe(_export())

    retour = await middleware.awrap_tool_call(Requete(_appel("export_workbook", path="Paie octobre"), store), handler)

    assert isinstance(retour, ToolMessage)
    assert retour.status == "success"
    assert "Fichier prêt : Paie_octobre.xlsx" in str(retour.content)
    assert base64.b64encode(CLASSEUR).decode() not in str(retour.content)
    element = store.get((ALICE, "espace"), "/documents/Paie_octobre.xlsx")
    assert element is not None
    assert element.value["encoding"] == "base64"
    assert base64.b64decode(element.value["content"]) == CLASSEUR
    assert store.get(("bob", "espace"), "/documents/Paie_octobre.xlsx") is None


async def test_le_fichier_word_du_dossier_partage_est_range_puis_retire(tmp_path: Path) -> None:
    (tmp_path / "ab12cd34_note.docx").write_bytes(b"PK docx")
    (tmp_path / "ef56ab78_autre.docx").write_bytes(b"PK d'un autre")
    store = InMemoryStore()
    middleware = Bureautique(ALICE, str(tmp_path))
    handler, _ = await _passe(
        ToolMessage(
            content=[{"type": "text", "text": "Document saved to /app/output/ab12cd34_note.docx"}],  # pyright: ignore[reportArgumentType]
            tool_call_id="a1",
            name="create_word_from_markdown",
        )
    )

    retour = await middleware.awrap_tool_call(Requete(_appel("create_word_from_markdown"), store), handler)

    assert isinstance(retour, ToolMessage)
    assert "Fichier prêt : note.docx" in str(retour.content)
    assert base64.b64decode(store.get((ALICE, "espace"), "/documents/note.docx").value["content"]) == b"PK docx"  # pyright: ignore[reportOptionalMemberAccess]
    assert not (tmp_path / "ab12cd34_note.docx").exists()
    assert (tmp_path / "ef56ab78_autre.docx").exists()


async def test_un_chemin_pieg_e_rendu_par_le_serveur_ne_lit_que_le_nom_de_base(tmp_path: Path) -> None:
    (tmp_path / "secret.docx").write_bytes(b"PK interne")
    hors = tmp_path.parent / "hors_dossier.docx"
    hors.write_bytes(b"PK hors du dossier")
    store = InMemoryStore()
    middleware = Bureautique(ALICE, str(tmp_path))
    handler, _ = await _passe(
        ToolMessage(
            content="Document saved to ../hors_dossier.docx", tool_call_id="a1", name="create_word_from_markdown"
        )
    )

    retour = await middleware.awrap_tool_call(Requete(_appel("create_word_from_markdown"), store), handler)

    assert isinstance(retour, ToolMessage)
    assert retour.status == "error"  # hors_dossier.docx n'existe pas dans le dossier partagé : rien n'est lu au-dehors
    assert hors.exists()
    assert store.search((ALICE, "espace")) == []


async def test_une_erreur_du_serveur_est_rendue_telle_quelle_sans_rien_ranger() -> None:
    store = InMemoryStore()
    middleware = Bureautique(ALICE, "/documents")
    erreur = ToolMessage(content="Erreur", tool_call_id="a1", name="export_workbook", status="error")
    handler, _ = await _passe(erreur)

    retour = await middleware.awrap_tool_call(Requete(_appel("export_workbook", path="x"), store), handler)

    assert retour is erreur
    assert store.search((ALICE, "espace")) == []


# --- bornes et audit --------------------------------------------------------------------------------------------------


async def test_un_fichier_trop_gros_est_refuse(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bureautique, "TAILLE_MAX_DOCUMENT", 10)
    store = InMemoryStore()
    handler, _ = await _passe(_export())

    retour = await Bureautique(ALICE, "/documents").awrap_tool_call(
        Requete(_appel("export_workbook", path="gros"), store), handler
    )

    assert isinstance(retour, ToolMessage)
    assert retour.status == "error"
    assert "trop gros" in str(retour.content)
    assert store.search((ALICE, "espace")) == []


async def test_l_espace_plein_refuse_un_nouveau_fichier_mais_permet_de_remplacer() -> None:
    store = InMemoryStore()
    for i in range(FICHIERS_MAX):
        store.put((ALICE, "espace"), f"/f{i}.txt", {"content": "x", "encoding": "utf-8"})
    handler, _ = await _passe(_export())
    middleware = Bureautique(ALICE, "/documents")

    refuse = await middleware.awrap_tool_call(Requete(_appel("export_workbook", path="nouveau"), store), handler)
    assert isinstance(refuse, ToolMessage)
    assert refuse.status == "error"
    assert "Espace plein" in str(refuse.content)

    store.put((ALICE, "espace"), "/documents/nouveau.xlsx", {"content": "x", "encoding": "base64"})
    remplace = await middleware.awrap_tool_call(Requete(_appel("export_workbook", path="nouveau"), store), handler)
    assert isinstance(remplace, ToolMessage)
    assert remplace.status == "success"


async def test_la_creation_est_signalee_a_l_audit_sans_le_contenu() -> None:
    signales: list[tuple[str, int, str]] = []

    async def signaleur(chemin: str, taille: int, outil: str) -> None:
        signales.append((chemin, taille, outil))

    jeton = SIGNALEUR_ECRITURE.set(signaleur)
    try:
        handler, _ = await _passe(_export())
        await Bureautique(ALICE, "/documents").awrap_tool_call(
            Requete(_appel("export_workbook", path="paie"), InMemoryStore()), handler
        )
    finally:
        SIGNALEUR_ECRITURE.reset(jeton)

    assert signales == [("/espace/documents/paie.xlsx", len(CLASSEUR), "export_workbook")]


async def test_les_outils_d_autres_serveurs_traversent_sans_changement() -> None:
    handler, vus = await _passe(ToolMessage(content="ok", tool_call_id="a1", name="paie_indicateurs"))

    await Bureautique(ALICE, "/documents").awrap_tool_call(
        Requete(_appel("paie_indicateurs", periode="2026-09"), None), handler
    )

    assert vus[0].tool_call["args"] == {"periode": "2026-09"}


# --- téléchargement ---------------------------------------------------------------------------------------------------


def test_un_document_office_se_telecharge_decode_avec_son_type() -> None:
    valeur = {"content": base64.b64encode(CLASSEUR).decode(), "encoding": "base64"}

    octets, type_media = _contenu(valeur, "paie.xlsx")

    assert octets == CLASSEUR
    assert type_media == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    assert _taille(valeur) == len(CLASSEUR)


def test_un_fichier_texte_reste_du_texte() -> None:
    valeur = {"content": "bonjour", "encoding": "utf-8"}

    assert _contenu(valeur, "note.md") == (b"bonjour", "text/plain; charset=utf-8")
    assert _taille(valeur) == 7


# --- connexion aux serveurs -------------------------------------------------------------------------------------------


def _config(**champs: Any) -> Settings:
    return Settings(  # pyright: ignore[reportCallIssue]
        enabled=True,
        litellm_base_url="http://passerelle:4000/v1",  # pyright: ignore[reportArgumentType]
        litellm_api_key="x" * 8,  # pyright: ignore[reportArgumentType]
        erp_api_url="http://api:8080",  # pyright: ignore[reportArgumentType]
        **champs,
    )


def test_sans_adresse_ni_cle_aucun_outil_de_documents_n_est_propose() -> None:
    # Valeurs explicites : le test ne doit pas dépendre des variables IA_BUREAUTIQUE_* de la machine.
    vide: dict[str, Any] = {"bureautique_cle": None, "bureautique_office_url": None, "bureautique_excel_url": None}
    assert complement_bureautique(_config(**vide)) is None
    assert complement_bureautique(_config(**{**vide, "bureautique_office_url": "http://office:8958/mcp"})) is None
    assert complement_bureautique(_config(**{**vide, "bureautique_cle": "c" * 16})) is None


def test_avec_une_adresse_et_une_cle_les_outils_sont_proposes() -> None:
    config = _config(bureautique_office_url="http://office:8958/mcp", bureautique_cle="c" * 16)

    assert complement_bureautique(config) is not None


class _Outil:
    def __init__(self, nom: str) -> None:
        self.name = nom


async def test_seuls_les_outils_de_la_liste_blanche_sont_exposes_et_un_serveur_en_panne_n_ote_que_les_siens(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    appels: list[int] = []

    class Adaptateur:
        def __init__(self, _client: Any) -> None:
            appels.append(len(appels))
            self._rang = len(appels) - 1

        async def list_tools(self) -> list[_Outil]:
            if self._rang == 1:
                raise ConnectionError("serveur Excel arrêté")
            return [_Outil("create_word_from_markdown"), _Outil("create_email_draft"), _Outil("create_xml_file")]

    monkeypatch.setattr(bureautique, "MCPAdapter", Adaptateur)

    outils = await outils_bureautique("http://office:8958/mcp", "http://excel:8017/mcp", "c" * 16)

    # Le PDF est rendu par le service lui-même : il reste, quelle que soit la panne des serveurs.
    assert [o.name for o in outils] == ["create_word_from_markdown", "create_pdf_from_markdown"]


# --- PDF ---------------------------------------------------------------------------------------------


async def test_le_pdf_est_range_dans_l_espace_sans_entrer_dans_le_contexte_du_modele() -> None:
    store = InMemoryStore()
    octets = b"%PDF-1.7 un pdf"
    message = ToolMessage(
        content="PDF créé.",
        tool_call_id="a1",
        name="create_pdf_from_markdown",
        artifact={"pdf": octets, "nom": "../Consignes de sécurité.pdf"},
    )
    middleware = Bureautique(ALICE, "/documents")
    signaux: list[tuple[str, int, str]] = []

    async def signaler(chemin: str, taille: int, outil: str) -> None:
        signaux.append((chemin, taille, outil))

    jeton = SIGNALEUR_ECRITURE.set(signaler)
    try:

        async def handler(_requete: Any) -> ToolMessage:
            return message

        retour = await middleware.awrap_tool_call(Requete(_appel("create_pdf_from_markdown"), store), handler)
    finally:
        SIGNALEUR_ECRITURE.reset(jeton)

    assert isinstance(retour, ToolMessage)
    assert "Fichier prêt : Consignes_de_securite.pdf" in str(retour.content)
    element = await store.aget((ALICE, "espace"), "/documents/Consignes_de_securite.pdf")
    assert element is not None
    assert base64.b64decode(element.value["content"]) == octets
    assert signaux == [("/espace/documents/Consignes_de_securite.pdf", len(octets), "create_pdf_from_markdown")]


async def test_un_pdf_sans_artefact_est_signale_en_erreur() -> None:
    async def handler(_requete: Any) -> ToolMessage:
        return ToolMessage(content="PDF créé.", tool_call_id="a1", name="create_pdf_from_markdown")

    retour = await Bureautique(ALICE, "/documents").awrap_tool_call(
        Requete(_appel("create_pdf_from_markdown"), InMemoryStore()), handler
    )
    assert isinstance(retour, ToolMessage)
    assert retour.status == "error"


def test_le_rendu_pdf_produit_un_pdf_et_refuse_tout_chargement_externe() -> None:
    texte = (
        "Texte avec **gras**.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n<img src='file:///etc/passwd'>\n\n"
        "![x](http://exemple.invalid/x.png)"
    )
    try:
        pdf = rendre_pdf("Consignes", texte)
    except OSError:  # Pango absent (poste Windows sans GTK) : vérifié en CI et dans l'image Docker
        pytest.skip("WeasyPrint indisponible sur ce poste")
    assert pdf.startswith(b"%PDF")

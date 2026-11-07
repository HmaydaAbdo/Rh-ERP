"""Imports Excel des fonctions et des équipes, de bout en bout sur PostgreSQL réel.

Parité avec `FunctionImportService` et `EquipeImportService` : import atomique (une ligne rejetée refuse tout le
fichier, HTTP 400 avec le rapport), modèle vierge, audit avec l'empreinte du fichier, permission dédiée.
"""

import uuid
from collections.abc import Callable, Iterator
from io import BytesIO
from typing import Any

import pytest
from conftest import ADMIN, Plateforme
from openpyxl import Workbook, load_workbook
from sqlalchemy import text

TYPE_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@pytest.fixture
def marque(plateforme: Plateforme) -> Iterator[str]:
    m = uuid.uuid4().hex[:6].upper()
    yield m
    with plateforme.moteur.begin() as c:
        c.execute(text("DELETE FROM fonction WHERE libelle LIKE :m"), {"m": f"%{m}%"})
        c.execute(text("DELETE FROM equipe WHERE code LIKE :m"), {"m": f"%{m}%"})


def _classeur(lignes: list[list[Any]]) -> bytes:
    classeur = Workbook()
    feuille = classeur.active
    assert feuille is not None
    for ligne in lignes:
        feuille.append(ligne)
    sortie = BytesIO()
    classeur.save(sortie)
    return sortie.getvalue()


def _entetes(connecter: Callable[[str, str], dict[str, Any]], identite: tuple[str, str] = ADMIN) -> dict[str, str]:
    return {"Authorization": f"Bearer {connecter(*identite)['accessToken']}"}


def _poster(plateforme: Plateforme, chemin: str, entetes: dict[str, str], contenu: bytes) -> Any:
    return plateforme.client.post(chemin, headers=entetes, files={"file": ("ref.xlsx", contenu, TYPE_XLSX)})


def _compter(plateforme: Plateforme, table: str, colonne: str, marque: str) -> int:
    with plateforme.moteur.connect() as c:
        return c.execute(
            text(f"SELECT count(*) FROM {table} WHERE {colonne} LIKE :m"),  # noqa: S608
            {"m": f"%{marque}%"},
        ).scalar_one()


def _dernier_journal(plateforme: Plateforme, action: str) -> Any:
    with plateforme.moteur.connect() as c:
        return (
            c.execute(
                text(
                    "SELECT resultat, nombre_elements, perimetre, motif FROM audit_journal "
                    "WHERE action = :a ORDER BY id DESC LIMIT 1"
                ),
                {"a": action},
            )
            .mappings()
            .one()
        )


# --- fonctions ------------------------------------------------------------------------------------------------


def test_import_fonctions_cree_les_lignes_et_audite_le_fichier(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], marque: str
) -> None:
    contenu = _classeur([["Fonction"], [f"Maçon {marque}"], [None], [f"  Grutier {marque} "]])

    reponse = _poster(plateforme, "/functions/import", _entetes(connecter), contenu)

    assert reponse.status_code == 200, reponse.text
    assert reponse.json() == {"totalLignes": 2, "crees": 2, "ignores": 0, "lignesIgnorees": []}
    assert _compter(plateforme, "fonction", "libelle", marque) == 2
    journal = _dernier_journal(plateforme, "FONCTION_IMPORT")
    assert (journal["resultat"], journal["nombre_elements"]) == ("SUCCES", 2)
    assert journal["perimetre"]["totalLignes"] == 2
    assert journal["perimetre"]["fichierNom"] == "ref.xlsx"
    assert journal["perimetre"]["fichierTaille"] == len(contenu)
    assert len(journal["perimetre"]["fichierSha256"]) == 64


def test_import_fonctions_rejette_tout_le_fichier_si_une_ligne_est_invalide(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], marque: str
) -> None:
    existante = f"Existante {marque}"
    with plateforme.moteur.begin() as c:
        c.execute(text("INSERT INTO fonction (libelle) VALUES (:l)"), {"l": existante})
    contenu = _classeur(
        [
            ["Fonction"],
            [f"Valide {marque}"],
            [existante.upper()],
            [f"Valide {marque}".lower()],
            ["x" * 101],
        ]
    )

    reponse = _poster(plateforme, "/functions/import", _entetes(connecter), contenu)

    assert reponse.status_code == 400, reponse.text
    corps = reponse.json()
    assert (corps["totalLignes"], corps["crees"], corps["ignores"]) == (4, 0, 3)
    assert [(x["numeroLigne"], x["raison"]) for x in corps["lignesIgnorees"]] == [
        (3, "Fonction déjà existante"),
        (4, "Fonction déjà existante"),
        (5, "Libellé trop long (max 100 caractères)"),
    ]
    assert _compter(plateforme, "fonction", "libelle", marque) == 1, "seule la fonction préexistante"
    journal = _dernier_journal(plateforme, "FONCTION_IMPORT")
    assert (journal["resultat"], journal["nombre_elements"]) == ("ECHEC", 0)
    assert journal["motif"] == "3 ligne(s) rejetée(s) sur 4"


def test_import_fonctions_refuse_un_fichier_illisible(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]]
) -> None:
    reponse = _poster(plateforme, "/functions/import", _entetes(connecter), b"pas un classeur")

    assert reponse.status_code == 400, reponse.text
    assert reponse.json()["message"].startswith("Fichier Excel illisible")


def test_modele_fonctions_est_un_classeur_vierge(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]]
) -> None:
    reponse = plateforme.client.get("/functions/import/modele", headers=_entetes(connecter))

    assert reponse.status_code == 200
    assert "Modele_Import_Fonctions.xlsx" in reponse.headers["content-disposition"]
    feuille = load_workbook(BytesIO(reponse.content)).worksheets[0]
    assert [[c.value for c in ligne] for ligne in feuille.iter_rows()] == [["Fonction"]]


def test_import_fonctions_exige_la_permission_dediee(
    plateforme: Plateforme,
    connecter: Callable[[str, str], dict[str, Any]],
    creer_utilisateur: Callable[..., tuple[int, str]],
    marque: str,
) -> None:
    nom = f"sans-import-{uuid.uuid4().hex[:8]}"
    _, mot_de_passe = creer_utilisateur(roles=("SYSTEM_ADMIN",), refusees=("FUNCTION_IMPORT",), username=nom)
    entetes = _entetes(connecter, (nom, mot_de_passe))

    envoi = _poster(plateforme, "/functions/import", entetes, _classeur([["Fonction"], [f"X {marque}"]]))
    modele = plateforme.client.get("/functions/import/modele", headers=entetes)

    assert (envoi.status_code, modele.status_code) == (403, 403)
    assert _compter(plateforme, "fonction", "libelle", marque) == 0


# --- équipes --------------------------------------------------------------------------------------------------


def test_import_equipes_cree_les_lignes_avec_le_code_en_majuscules(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], marque: str
) -> None:
    contenu = _classeur([["Code", "Libellé"], [f"e{marque}1", "Équipe un"], [f"E{marque}2", "Équipe deux"]])

    reponse = _poster(plateforme, "/equipes/import", _entetes(connecter), contenu)

    assert reponse.status_code == 200, reponse.text
    assert reponse.json() == {"totalLignes": 2, "crees": 2, "ignores": 0, "lignesIgnorees": []}
    with plateforme.moteur.connect() as c:
        codes = [
            r[0]
            for r in c.execute(text("SELECT code FROM equipe WHERE code LIKE :m ORDER BY code"), {"m": f"%{marque}%"})
        ]
    assert codes == [f"E{marque}1", f"E{marque}2"]
    journal = _dernier_journal(plateforme, "EQUIPE_IMPORT")
    assert (journal["resultat"], journal["nombre_elements"]) == ("SUCCES", 2)
    assert journal["perimetre"]["totalLignes"] == 2


def test_import_equipes_rejette_tout_avec_la_premiere_raison_de_chaque_ligne(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], marque: str
) -> None:
    with plateforme.moteur.begin() as c:
        c.execute(
            text("INSERT INTO equipe (code, libelle) VALUES (:c, :l)"),
            {"c": f"E{marque}X", "l": f"Existante {marque}"},
        )
    contenu = _classeur(
        [
            ["Code", "Libellé"],
            [f"E{marque}A", f"Valide {marque}"],
            [None, "Sans code"],
            [f"E{marque}B", None],
            [f"E{marque}A", f"Autre {marque}"],
            [f"E{marque}C", f"Valide {marque}"],
            [f"e{marque}x", f"Nouveau {marque}"],
            [f"E{marque}D", f"EXISTANTE {marque}"],
            [f"E{marque}E", f"Colonne {marque}", "en trop"],
            ["C" * 51, "Code long"],
        ]
    )

    reponse = _poster(plateforme, "/equipes/import", _entetes(connecter), contenu)

    assert reponse.status_code == 400, reponse.text
    corps = reponse.json()
    assert (corps["totalLignes"], corps["crees"], corps["ignores"]) == (9, 0, 8)
    assert [(x["numeroLigne"], x["raison"]) for x in corps["lignesIgnorees"]] == [
        (3, "Code obligatoire"),
        (4, "Libellé obligatoire"),
        (5, "Code déjà présent dans le fichier"),
        (6, "Libellé déjà présent dans le fichier"),
        (7, "Code d'équipe déjà existant"),
        (8, "Libellé d'équipe déjà existant"),
        (9, "Colonnes supplémentaires non prises en charge"),
        (10, "Code trop long (max 50 caractères)"),
    ]
    assert _compter(plateforme, "equipe", "code", marque) == 1, "seule l'équipe préexistante"
    journal = _dernier_journal(plateforme, "EQUIPE_IMPORT")
    assert (journal["resultat"], journal["nombre_elements"]) == ("ECHEC", 0)


@pytest.mark.parametrize(
    "entete",
    [["Libellé", "Code"], ["Code"], ["Code", "Libellé", "Autre"]],
)
def test_import_equipes_refuse_un_en_tete_inattendu(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], entete: list[str]
) -> None:
    reponse = _poster(plateforme, "/equipes/import", _entetes(connecter), _classeur([entete, ["A", "B"]]))

    assert reponse.status_code == 400, reponse.text
    assert reponse.json()["message"].startswith("Format invalide")


def test_modele_equipes_et_permission(
    plateforme: Plateforme,
    connecter: Callable[[str, str], dict[str, Any]],
    creer_utilisateur: Callable[..., tuple[int, str]],
) -> None:
    reponse = plateforme.client.get("/equipes/import/modele", headers=_entetes(connecter))
    feuille = load_workbook(BytesIO(reponse.content)).worksheets[0]
    nom = f"sans-import-{uuid.uuid4().hex[:8]}"
    _, mot_de_passe = creer_utilisateur(roles=("SYSTEM_ADMIN",), refusees=("EQUIPE_IMPORT",), username=nom)
    interdit = plateforme.client.get("/equipes/import/modele", headers=_entetes(connecter, (nom, mot_de_passe)))

    assert reponse.status_code == 200
    assert [[c.value for c in ligne] for ligne in feuille.iter_rows()] == [["Code", "Libellé"]]
    assert interdit.status_code == 403

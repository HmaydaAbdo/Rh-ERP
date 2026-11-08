"""Import de paie : contrat HTTP de l'assistant (fichier, période, corrections), refontes décidées par le propriétaire.

Ces cas reprennent ceux du banc différentiel Spring/Python, supprimé (KAN-238) : chacun fixe un comportement
volontairement différent de l'ancien backend (voir ``site/docs/migration/paie.md``). Seuls des fichiers sans fiche
connue sont envoyés : l'analyse ne lit que la base et n'écrit rien.
"""

import json
from io import BytesIO
from typing import Any

import pytest
from conftest import ADMIN, Plateforme
from openpyxl import Workbook

MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
PERIODE = "2997-01"
ANALYSE = "/paie/import/analyse"
CORRECTIONS = "/paie/import/corrections"


def _classeur(lignes: list[list[Any]], entetes: int = 3) -> bytes:
    classeur = Workbook()
    feuille = classeur.active
    assert feuille is not None
    for _ in range(entetes):
        feuille.append([])
    for ligne in lignes:
        feuille.append(ligne)
    sortie = BytesIO()
    classeur.save(sortie)
    return sortie.getvalue()


def _ligne(nom: str, cin: str | None, jours: Any = 26, salaire: Any = 4500) -> list[Any]:
    return [nom, "Maçon", cin, jours, 0, 0, salaire, 0, 0, salaire, None, "CH-A", None]


def _fichier(contenu: bytes, nom: str = "paie.xlsx", mime: str = MIME) -> dict[str, tuple[str, bytes, str]]:
    return {"file": (nom, contenu, mime)}


@pytest.fixture
def entetes(plateforme: Plateforme, connecter: Any) -> dict[str, str]:
    return {"Authorization": f"Bearer {connecter(*ADMIN)['accessToken']}"}


def _poster(plateforme: Plateforme, entetes: dict[str, str], chemin: str, **requete: Any) -> Any:
    return plateforme.client.post(chemin, headers=entetes, **requete)


def test_une_cellule_invalide_est_signalee_ligne_par_ligne_sans_rejeter_le_fichier(
    plateforme: Plateforme, entetes: dict[str, str]
) -> None:
    lignes = [
        _ligne("Jours Texte", "ZC1", "abc"),
        _ligne("Jours Mille", "ZC2", 1000),
        _ligne("Salaire Texte", "ZC3", 26, "4 500,50"),
        _ligne("", "ZC4"),
        _ligne("Sans Cin", None),
    ]
    reponse = _poster(plateforme, entetes, ANALYSE, files=_fichier(_classeur(lignes)), data={"periode": PERIODE})

    assert reponse.status_code == 200, reponse.text
    analyse = reponse.json()
    assert analyse["totalLignes"] == 5
    assert {e["numeroLigne"] for e in analyse["erreurs"]} == {4, 5, 6, 7, 8}
    assert analyse["pret"] is False


def test_les_lignes_vides_sont_ignorees_et_gardent_leur_numero_excel(
    plateforme: Plateforme, entetes: dict[str, str]
) -> None:
    lignes = [_ligne("A", "ZV1"), [], [None] * 13, [" "] * 13, _ligne("B", "ZV2")]
    analyse = _poster(plateforme, entetes, ANALYSE, files=_fichier(_classeur(lignes)), data={"periode": PERIODE}).json()

    assert analyse["totalLignes"] == 2
    assert {e["numeroLigne"] for e in analyse["erreurs"]} == {4, 8}


def test_un_fichier_a_cinq_colonnes_signale_les_champs_obligatoires_absents(
    plateforme: Plateforme, entetes: dict[str, str]
) -> None:
    fichier = _fichier(_classeur([["A", "Maçon", "ZQ1", 26, 0]]))
    analyse = _poster(plateforme, entetes, ANALYSE, files=fichier, data={"periode": PERIODE}).json()

    absents = {e["champ"] for e in analyse["erreurs"] if e["raison"] == "champ obligatoire absent"}
    assert "salaireMensuel" in absents


def test_les_colonnes_en_trop_sont_ignorees(plateforme: Plateforme, entetes: dict[str, str]) -> None:
    fichier = _fichier(_classeur([[*_ligne("A", "ZX1"), "extra", "extra2"]]))
    reponse = _poster(plateforme, entetes, ANALYSE, files=fichier, data={"periode": PERIODE})

    assert reponse.status_code == 200
    assert reponse.json()["totalLignes"] == 1


@pytest.mark.parametrize("contenu", [_classeur([]), _classeur([_ligne("A", "ZE1")], entetes=0)])
def test_un_fichier_sans_ligne_de_donnees_est_analyse_a_vide(
    plateforme: Plateforme, entetes: dict[str, str], contenu: bytes
) -> None:
    reponse = _poster(plateforme, entetes, ANALYSE, files=_fichier(contenu), data={"periode": PERIODE})

    assert reponse.status_code == 200
    assert reponse.json()["totalLignes"] == 0
    assert reponse.json()["pret"] is False


@pytest.mark.parametrize("contenu", [b"pas un classeur", b""])
def test_un_fichier_illisible_est_refuse_avec_un_message_propre(
    plateforme: Plateforme, entetes: dict[str, str], contenu: bytes
) -> None:
    reponse = _poster(plateforme, entetes, ANALYSE, files=_fichier(contenu), data={"periode": PERIODE})

    assert reponse.status_code == 400
    assert (
        reponse.json()["message"] == "Fichier Excel illisible : le fichier n'est pas un classeur Excel (.xlsx) valide."
    )


@pytest.mark.parametrize(("nom", "mime"), [("paie.xls", "application/vnd.ms-excel"), ("paie.txt", "text/plain")])
def test_le_contenu_du_classeur_decide_pas_son_nom_ni_son_type_declare(
    plateforme: Plateforme, entetes: dict[str, str], nom: str, mime: str
) -> None:
    fichier = _fichier(_classeur([_ligne("A", "ZN1")]), nom, mime)
    reponse = _poster(plateforme, entetes, ANALYSE, files=fichier, data={"periode": PERIODE})

    assert reponse.status_code == 200
    assert reponse.json()["totalLignes"] == 1


@pytest.mark.parametrize("periode", ["2997-13", "2997-1", "abc", "9999-12", "1899-12"])
def test_une_periode_invalide_ou_hors_1900_2999_est_refusee(
    plateforme: Plateforme, entetes: dict[str, str], periode: str
) -> None:
    fichier = _fichier(_classeur([_ligne("A", "ZP1")]))
    reponse = _poster(plateforme, entetes, ANALYSE, files=fichier, data={"periode": periode})

    assert reponse.status_code == 400
    assert reponse.json()["message"] == f"Période invalide, format attendu aaaa-MM (ex. 2026-08) : {periode}"


def test_une_periode_absente_ou_vide_est_refusee_de_la_meme_facon(
    plateforme: Plateforme, entetes: dict[str, str]
) -> None:
    fichier = _fichier(_classeur([_ligne("A", "ZP2")]))
    for donnees in ({}, {"periode": ""}):
        reponse = _poster(plateforme, entetes, ANALYSE, files=fichier, data=donnees)
        assert reponse.status_code == 400
        assert reponse.json()["message"] == "Paramètre obligatoire absent : periode."


def test_la_periode_peut_venir_de_l_adresse_et_une_annee_passee_est_acceptee(
    plateforme: Plateforme, entetes: dict[str, str]
) -> None:
    fichier = _fichier(_classeur([_ligne("A", "ZP3")]))
    en_adresse = _poster(plateforme, entetes, ANALYSE, files=fichier, params={"periode": PERIODE})
    passee = _poster(plateforme, entetes, ANALYSE, files=fichier, data={"periode": "1999-01"})

    assert en_adresse.status_code == passee.status_code == 200
    assert (en_adresse.json()["periode"], passee.json()["periode"]) == (PERIODE, "1999-01")


def test_un_fichier_ou_une_partie_absente_est_un_400_et_non_un_500(
    plateforme: Plateforme, entetes: dict[str, str]
) -> None:
    sans_fichier = _poster(plateforme, entetes, ANALYSE, data={"periode": PERIODE})
    sans_corrections = _poster(
        plateforme, entetes, CORRECTIONS, files=_fichier(_classeur([_ligne("A", "ZF1")])), data={"periode": PERIODE}
    )

    assert sans_fichier.status_code == 400
    assert sans_fichier.json()["message"] == "file : Ce champ est obligatoire."
    assert sans_corrections.status_code == 400
    assert sans_corrections.json()["message"] == "corrections : Ce champ est obligatoire."


def test_des_corrections_vides_redonnent_l_analyse(plateforme: Plateforme, entetes: dict[str, str]) -> None:
    donnees = {"periode": PERIODE, "corrections": "{}"}
    reponse = _poster(plateforme, entetes, CORRECTIONS, files=_fichier(_classeur([_ligne("A", "ZK1")])), data=donnees)

    assert reponse.status_code == 200
    assert reponse.json()["totalLignes"] == 1


def test_une_correction_vers_une_fiche_non_proposee_est_refusee(
    plateforme: Plateforme, entetes: dict[str, str]
) -> None:
    donnees = {"periode": PERIODE, "corrections": json.dumps({"aligner": [{"employeId": 999999}]})}
    reponse = _poster(plateforme, entetes, CORRECTIONS, files=_fichier(_classeur([_ligne("A", "ZK2")])), data=donnees)

    assert reponse.status_code == 400
    assert (
        reponse.json()["message"] == "Chaque correction doit viser une fiche proposée par l'analyse du fichier joint."
    )


def test_une_creation_demandee_sur_une_ligne_qui_n_est_pas_un_cin_inconnu_est_refusee(
    plateforme: Plateforme, entetes: dict[str, str]
) -> None:
    creation = {"numeroLigne": 4, "dateNaissance": "1992-01-01", "dateEmbauche": "2026-01-01", "typeSalaire": "MENSUEL"}
    donnees = {"periode": PERIODE, "corrections": json.dumps({"creer": [creation]})}
    reponse = _poster(plateforme, entetes, CORRECTIONS, files=_fichier(_classeur([_ligne("", "ZK3")])), data=donnees)

    assert reponse.status_code == 400
    assert reponse.json()["message"] == "La ligne Excel 4 contient des erreurs à corriger avant le wizard."


def test_un_import_est_refuse_tant_que_le_fichier_contient_des_erreurs(
    plateforme: Plateforme, entetes: dict[str, str]
) -> None:
    donnees = {"periode": PERIODE, "periode_confirmee": "true"}
    reponse = _poster(
        plateforme, entetes, "/paie/import", files=_fichier(_classeur([_ligne("A", "ZI1")])), data=donnees
    )

    assert reponse.status_code == 400
    assert "Réanalysez-le." in reponse.json()["message"]

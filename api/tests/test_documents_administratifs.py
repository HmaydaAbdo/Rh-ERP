"""Documents administratifs (KAN-320) : import des déclarations CNSS et attestation de travail.

Le rendu WeasyPrint est remplacé par un double : la page HTML est vérifiée ici, le PDF dans l'image Linux (Pango
absent sous Windows, voir `conventions/lecons.md`).
"""

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime
from io import BytesIO
from pathlib import Path
from typing import Any

import pytest
from conftest import ADMIN, Plateforme
from openpyxl import Workbook
from sqlalchemy import text

from staport.domains.employee import attestation_pdf
from staport.domains.employee.attestation_pdf import Attestation, construire_html
from staport.domains.employee.models import Civilite

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@dataclass
class Jeu:
    entetes: dict[str, str]
    fonction: dict[str, Any]
    chantier: dict[str, Any]
    marque: str


@pytest.fixture
def jeu(plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]]) -> Jeu:
    entetes = {"Authorization": f"Bearer {connecter(*ADMIN)['accessToken']}"}
    marque = uuid.uuid4().hex[:8].upper()
    client = plateforme.client
    fonction = client.post("/functions", headers=entetes, json={"libelle": f"CHAUFFEUR CAMION {marque}"}).json()
    chantier = client.post(
        "/chantiers",
        headers=entetes,
        json={"code": f"DOC{marque}", "designation": "Siège", "nature": "AO", "afficherSurCarte": False},
    ).json()
    return Jeu(entetes, fonction, chantier, marque)


def _employe(plateforme: Plateforme, jeu: Jeu, suffixe: str, **champs: Any) -> dict[str, Any]:
    corps = {
        "nomPrenom": f"ALAMI YOUSSEF {suffixe}",
        "cin": f"AB{jeu.marque}{suffixe}",
        "dateNaissance": "1990-01-02",
        "dateEmbauche": "2024-06-01",
        "fonctionId": jeu.fonction["id"],
        "chantierId": jeu.chantier["id"],
        **champs,
    }
    reponse = plateforme.client.post("/employees", headers=jeu.entetes, json=corps)
    assert reponse.status_code == 201, reponse.text
    return reponse.json()


def _classeur(lignes: list[list[Any]]) -> bytes:
    classeur = Workbook()
    feuille = classeur.active
    assert feuille is not None
    feuille.title = "Employés"
    feuille.append(["N°", "Nom et prénom", "CIN", "Matricule CNSS", "Date de déclaration"])
    for ligne in lignes:
        feuille.append(ligne)
    sortie = BytesIO()
    classeur.save(sortie)
    return sortie.getvalue()


def _importer(plateforme: Plateforme, jeu: Jeu, contenu: bytes) -> Any:
    return plateforme.client.post(
        "/employees/import/cnss", headers=jeu.entetes, files={"file": ("cnss.xlsx", contenu, XLSX)}
    )


def _matricule() -> str:
    return str(uuid.uuid4().int)[:9]


def test_l_import_cnss_renseigne_les_fiches_et_ignore_les_non_declares(plateforme: Plateforme, jeu: Jeu) -> None:
    a, b = _employe(plateforme, jeu, "A"), _employe(plateforme, jeu, "B")
    matricule = _matricule()
    cin_ecrit_autrement = f"ab {jeu.marque}A"
    contenu = _classeur(
        [
            [1, a["nomPrenom"], cin_ecrit_autrement, f" {matricule} ", datetime(2024, 6, 1)],
            [2, b["nomPrenom"], b["cin"], None, None],
        ]
    )

    reponse = _importer(plateforme, jeu, contenu)

    assert reponse.status_code == 200, reponse.text
    corps = reponse.json()
    assert (corps["totalLignes"], corps["misAJour"], corps["sansDeclaration"], corps["ignores"]) == (2, 1, 1, 0)
    fiche = plateforme.client.get(f"/employees/{a['id']}", headers=jeu.entetes).json()
    assert (fiche["matriculeCnss"], fiche["dateDeclarationCnss"]) == (matricule, "2024-06-01")
    deuxieme = _importer(plateforme, jeu, contenu).json()
    assert (deuxieme["misAJour"], deuxieme["inchanges"]) == (0, 1)  # rien n'est réécrit

    # Une modification de la fiche qui n'envoie pas la déclaration ne l'efface pas.
    modification = {k: fiche[k] for k in ("nomPrenom", "cin", "dateNaissance", "dateEmbauche", "statut", "version")} | {
        "fonctionId": jeu.fonction["id"],
        "chantierId": jeu.chantier["id"],
    }
    modifiee = plateforme.client.put(f"/employees/{a['id']}", headers=jeu.entetes, json=modification)
    assert modifiee.status_code == 200, modifiee.text
    assert modifiee.json()["matriculeCnss"] == matricule


def test_l_import_cnss_est_atomique_et_explique_chaque_ligne_refusee(plateforme: Plateforme, jeu: Jeu) -> None:
    a, b = _employe(plateforme, jeu, "C"), _employe(plateforme, jeu, "D")
    matricule = _matricule()
    contenu = _classeur(
        [
            [1, "A", a["cin"], matricule, datetime(2024, 6, 1)],
            [2, "B", b["cin"], matricule, datetime(2024, 6, 1)],
            [3, "X", f"ZZ{jeu.marque}", _matricule(), datetime(2024, 6, 1)],
            [4, "Y", "9.00000E+11", _matricule(), datetime(2024, 6, 1)],
            [5, "Z", a["cin"], "12A", None],
        ]
    )

    reponse = _importer(plateforme, jeu, contenu)

    assert reponse.status_code == 400
    raisons = {ligne["numeroLigne"]: ligne["raison"] for ligne in reponse.json()["lignesIgnorees"]}
    assert raisons[3] == f"Matricule CNSS en doublon dans le fichier (CIN {a['cin']})"
    assert raisons[4] == "Aucun employé avec ce CIN"
    assert raisons[5].startswith("Le CIN ne contient")
    assert raisons[6] == "CIN en doublon dans le fichier"
    fiche = plateforme.client.get(f"/employees/{a['id']}", headers=jeu.entetes).json()
    assert fiche["matriculeCnss"] is None  # rien n'est écrit


def test_un_fichier_sans_les_colonnes_cnss_est_refuse(plateforme: Plateforme, jeu: Jeu) -> None:
    classeur = Workbook()
    feuille = classeur.active
    assert feuille is not None
    feuille.append(["CIN", "Matricule"])
    sortie = BytesIO()
    classeur.save(sortie)

    reponse = _importer(plateforme, jeu, sortie.getvalue())

    assert reponse.status_code == 400
    assert "Matricule CNSS" in reponse.json()["message"]


def test_un_matricule_cnss_ne_peut_appartenir_qu_a_une_fiche(plateforme: Plateforme, jeu: Jeu) -> None:
    matricule = _matricule()
    _employe(plateforme, jeu, "E", matriculeCnss=matricule, dateDeclarationCnss="2024-06-01")
    doublon = plateforme.client.post(
        "/employees",
        headers=jeu.entetes,
        json={
            "nomPrenom": "AUTRE",
            "cin": f"AB{jeu.marque}F",
            "dateNaissance": "1990-01-02",
            "dateEmbauche": "2024-06-01",
            "fonctionId": jeu.fonction["id"],
            "chantierId": jeu.chantier["id"],
            "matriculeCnss": matricule,
        },
    )
    assert doublon.status_code == 409, doublon.text
    invalide = plateforme.client.post(
        "/employees", headers=jeu.entetes, json={"matriculeCnss": "12 A", "nomPrenom": "X"}
    )
    assert invalide.status_code == 400


def test_le_gabarit_de_l_attestation_reprend_le_modele_et_accorde_la_civilite() -> None:
    attestation = Attestation(
        civilite=Civilite.MADAME,
        nom_prenom="Benali <Sara>",
        cin="AB123456",
        matricule_cnss="123456789",
        depuis=date(2024, 6, 1),
        fonction="CHAUFFEUR CAMION",
        fait_le=date(2025, 10, 10),
    )

    html = construire_html(attestation)

    assert "Marrakech, le 10/10/2025" in html
    assert "ATTESTATION DE TRAVAIL" in html
    assert "Madame <strong>BENALI &lt;SARA&gt;</strong>" in html  # échappé
    assert "immatriculée à la CNSS sous le N° <strong>123456789</strong>" in html
    assert "<strong>CHAUFFEUR CAMION</strong> depuis le <strong>01/06/2024</strong>" in html
    assert "intéressée sur sa demande" in html
    assert "La Direction" in html
    masculin = construire_html(Attestation(**{**attestation.__dict__, "civilite": Civilite.MONSIEUR}))
    assert "immatriculé à la CNSS" in masculin and "intéressé sur" in masculin


def test_l_attestation_se_telecharge_et_garde_la_civilite_choisie(
    plateforme: Plateforme,
    jeu: Jeu,
    creer_utilisateur: Callable[..., tuple[int, str]],
    connecter: Callable[[str, str], dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pages: list[str] = []

    async def faux_rendu(html: str, base: Path) -> bytes:
        pages.append(html)
        return b"%PDF"

    monkeypatch.setattr(attestation_pdf, "rendre_pdf", faux_rendu)
    sans_cnss = _employe(plateforme, jeu, "G")
    declare = _employe(plateforme, jeu, "H", matriculeCnss=_matricule(), dateDeclarationCnss="2024-06-01")
    _id, mdp = creer_utilisateur(roles=("CHARGE_RH",), username=f"charge-rh-{jeu.marque.lower()}")
    charge_rh = {"Authorization": f"Bearer {connecter(f'charge-rh-{jeu.marque.lower()}', mdp)['accessToken']}"}

    refusee = plateforme.client.post(
        f"/employees/{sans_cnss['id']}/attestation-travail", headers=charge_rh, json={"civilite": "MONSIEUR"}
    )
    assert refusee.status_code == 400
    assert refusee.json()["message"] == (
        "Attestation impossible : le matricule CNSS n'est pas renseigné ; "
        "la date de déclaration CNSS n'est pas renseignée."
    )

    reponse = plateforme.client.post(
        f"/employees/{declare['id']}/attestation-travail", headers=charge_rh, json={"civilite": "MONSIEUR"}
    )

    assert reponse.status_code == 200, reponse.text
    assert reponse.headers["content-type"] == "application/pdf"
    assert f"Attestation_de_travail_{declare['cin']}.pdf" in reponse.headers["content-disposition"]
    assert "Monsieur <strong>ALAMI YOUSSEF H</strong>" in pages[-1]
    fiche = plateforme.client.get(f"/employees/{declare['id']}", headers=jeu.entetes).json()
    assert fiche["civilite"] == "MONSIEUR"
    with plateforme.moteur.connect() as c:
        assert (
            c.execute(
                text(
                    "SELECT count(*) FROM audit_journal WHERE action = 'EMPLOYE_MODIFICATION' AND entite_id = :i "
                    "AND perimetre ->> 'origine' = 'ATTESTATION_TRAVAIL'"
                ),
                {"i": declare["id"]},
            ).scalar_one()
            == 1
        )

    # Le chargé RH ne modifie pas une fiche par l'écran Employés.
    interdit = plateforme.client.put(f"/employees/{declare['id']}", headers=charge_rh, json={})
    assert interdit.status_code == 403


def test_un_employe_sorti_n_a_pas_d_attestation_de_travail(plateforme: Plateforme, jeu: Jeu) -> None:
    sorti = _employe(plateforme, jeu, "I", matriculeCnss=_matricule(), dateDeclarationCnss="2024-06-01")
    modification = {k: sorti[k] for k in ("nomPrenom", "cin", "dateNaissance", "dateEmbauche", "version")} | {
        "fonctionId": jeu.fonction["id"],
        "chantierId": None,
        "statut": "INACTIF",
    }
    assert plateforme.client.put(f"/employees/{sorti['id']}", headers=jeu.entetes, json=modification).status_code == 200

    reponse = plateforme.client.post(
        f"/employees/{sorti['id']}/attestation-travail", headers=jeu.entetes, json={"civilite": "MONSIEUR"}
    )

    assert reponse.status_code == 400
    assert reponse.json()["message"] == "Attestation impossible : l'employé n'est plus en poste."

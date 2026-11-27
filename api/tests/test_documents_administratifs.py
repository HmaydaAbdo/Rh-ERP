"""Documents administratifs (KAN-320) : import des déclarations CNSS et attestation de travail (Word)."""

import uuid
from collections.abc import Callable
from dataclasses import dataclass, replace
from datetime import date, datetime
from io import BytesIO
from typing import Any, cast

import pytest
from conftest import ADMIN, Plateforme
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt
from docx.styles.style import ParagraphStyle
from openpyxl import Workbook
from sqlalchemy import text

from staport.domains.employee.attestation import APOSTROPHE, Attestation, construire_docx
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


def test_l_attestation_word_suit_le_modele_et_accorde_la_civilite() -> None:
    attestation = Attestation(
        civilite=Civilite.MADAME,
        nom_prenom="Benali Sara",
        cin="AB123456",
        matricule_cnss="123456789",
        depuis=date(2024, 6, 1),
        fonction="CHAUFFEUR CAMION",
        fait_le=date(2025, 10, 10),
        capital_social=70_000_000,
    )

    document = Document(BytesIO(construire_docx(attestation)))

    paragraphes = [p.text for p in document.paragraphs]
    assert "MARRAKECH LE 10/10/2025" in paragraphes
    assert "ATTESTATION DE TRAVAIL" in paragraphes
    assert "La Direction" in paragraphes
    corps = next(p for p in document.paragraphs if p.text.startswith("Nous soussignés"))
    assert corps.text.startswith("Nous soussignés, la STE STAPORT S.A. attestons par la présente que Mme BENALI SARA ")
    assert "titulaire de la CIN N° AB123456, immatriculée à la CNSS sous N° 123456789" in corps.text
    assert f"en qualité de CHAUFFEUR CAMION depuis le 01/06/2024 jusqu{APOSTROPHE}à nos jours." in corps.text
    assert any("intéressée sur sa demande" in p for p in paragraphes)
    section = document.sections[0]
    assert section.header.part.blob.count(b"</pic:pic>") == 1  # l'en-tête ne garde que le logo
    assert "Direction des Ressources Humaines" not in "".join(p.text for p in section.header.paragraphs)
    pied = section.footer.tables[0].cell(0, 0).text
    assert pied.startswith("Société des Travaux d") and "Ponts et Routes - Société Anonyme" in pied
    assert "Capital Social : 70 000 000,00Dh | R.C : 96 537" in pied
    # Le modèle du propriétaire : Bahnschrift Light 14 pt, date en gras, titre en gras 16 pt sans soulignement,
    # corps aligné à gauche en interligne 1,5, « La Direction » centrée en 15 pt sans gras.
    normal = cast(ParagraphStyle, document.styles["Normal"])
    assert (normal.font.name, normal.font.size) == ("Bahnschrift Light", Pt(14))
    date_lieu = next(p for p in document.paragraphs if p.text.startswith("MARRAKECH"))
    assert date_lieu.alignment == WD_ALIGN_PARAGRAPH.RIGHT and date_lieu.runs[0].bold
    titre = next(p for p in document.paragraphs if p.text == "ATTESTATION DE TRAVAIL")
    assert titre.alignment == WD_ALIGN_PARAGRAPH.CENTER
    assert titre.runs[0].bold and not titre.runs[0].underline and titre.runs[0].font.size == Pt(16)
    assert corps.alignment is None and corps.paragraph_format.line_spacing == 1.5  # pyright: ignore[reportUnknownMemberType]
    signature = next(p for p in document.paragraphs if p.text == "La Direction")
    assert signature.alignment == WD_ALIGN_PARAGRAPH.CENTER
    assert not signature.runs[0].bold and signature.runs[0].font.size == Pt(15)
    assert {r.text for r in corps.runs if r.bold} == {
        "STE STAPORT S.A",
        "Mme BENALI SARA",
        "AB123456",
        "123456789",
        "CHAUFFEUR CAMION",
        "01/06/2024",
    }
    masculin = "".join(
        p.text for p in Document(BytesIO(construire_docx(replace(attestation, civilite=Civilite.MONSIEUR)))).paragraphs
    )
    assert "Mr. BENALI SARA titulaire" in masculin
    assert "immatriculé à la CNSS" in masculin and "intéressé sur" in masculin
    # « en qualité d'AGENT » : élision devant une voyelle.
    agent = Document(BytesIO(construire_docx(replace(attestation, fonction="AGENT ADMINISTRATIF"))))
    assert f"en qualité d{APOSTROPHE}AGENT ADMINISTRATIF depuis" in "".join(p.text for p in agent.paragraphs)


def test_l_attestation_se_telecharge_et_garde_la_civilite_choisie(
    plateforme: Plateforme,
    jeu: Jeu,
    creer_utilisateur: Callable[..., tuple[int, str]],
    connecter: Callable[[str, str], dict[str, Any]],
) -> None:
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
    assert reponse.headers["content-type"] == (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    assert f"Attestation_de_travail_{declare['cin']}.docx" in reponse.headers["content-disposition"]
    document_word = Document(BytesIO(reponse.content))
    assert any("Mr. ALAMI YOUSSEF H" in p.text for p in document_word.paragraphs)
    assert "Capital Social : 70 000 000,00Dh" in document_word.sections[0].footer.tables[0].cell(0, 0).text
    fiche = plateforme.client.get(f"/employees/{declare['id']}", headers=jeu.entetes).json()
    assert fiche["civilite"] == "MONSIEUR"

    # Le capital se règle dans l'écran Paramètres et s'imprime sur les attestations suivantes.
    capital = next(
        p
        for p in plateforme.client.get("/parametres", headers=jeu.entetes).json()
        if p["cle"] == "societe.capital-social"
    )
    modifie = plateforme.client.put(
        f"/parametres/{capital['id']}", headers=jeu.entetes, json={"version": capital["version"], "valeur": "80000000"}
    )
    assert modifie.status_code == 200, modifie.text
    apres = plateforme.client.post(
        f"/employees/{declare['id']}/attestation-travail", headers=charge_rh, json={"civilite": "MONSIEUR"}
    )
    pied = Document(BytesIO(apres.content)).sections[0].footer.tables[0].cell(0, 0).text
    assert "Capital Social : 80 000 000,00Dh" in pied
    retour = {"version": modifie.json()["version"], "valeur": capital["valeur"]}
    assert plateforme.client.put(f"/parametres/{capital['id']}", headers=jeu.entetes, json=retour).status_code == 200
    mademoiselle = plateforme.client.post(
        f"/employees/{declare['id']}/attestation-travail", headers=charge_rh, json={"civilite": "MADEMOISELLE"}
    )
    assert mademoiselle.status_code == 400
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

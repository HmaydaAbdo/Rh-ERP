from datetime import date
from io import BytesIO
from typing import Any

from conftest import ADMIN, Plateforme
from openpyxl import Workbook, load_workbook


def _auth(connecter: Any) -> dict[str, str]:
    return {"Authorization": f"Bearer {connecter(*ADMIN)['accessToken']}"}


def _xlsx(rows: list[list[Any]]) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    assert sheet is not None
    sheet.append(["Date d'embauche", "Nom & prénom", "CIN", "Fonction", "Chantier", "Date de naissance"])
    for row in rows:
        sheet.append(row)
    flux = BytesIO()
    workbook.save(flux)
    return flux.getvalue()


def test_import_employee_xlsx_est_atomique(plateforme: Plateforme, connecter: Any) -> None:
    headers = _auth(connecter)
    fonction = plateforme.client.post("/functions", headers=headers, json={"libelle": "Conducteur import"}).json()
    chantier = plateforme.client.post(
        "/chantiers",
        headers=headers,
        json={"code": "IMP-1", "designation": "Chantier import", "nature": "AO", "afficherSurCarte": False},
    ).json()
    assert fonction["id"] and chantier["id"]
    valide = _xlsx([[date(2024, 1, 2), "Ali Import", "CIN-IMP-1", "Conducteur import", "IMP-1", date(1990, 1, 2)]])
    resultat = plateforme.client.post(
        "/employees/import",
        headers=headers,
        files={"file": ("employes.xlsx", valide, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert resultat.status_code == 200, resultat.text
    assert resultat.json()["crees"] == 1
    invalide = _xlsx(
        [
            [date(2024, 1, 2), "Dup", "CIN-IMP-1", "Conducteur import", "IMP-1", date(1990, 1, 2)],
            [date(2024, 1, 2), "Erreur", "CIN-IMP-2", "Inconnue", "IMP-1", date(1990, 1, 2)],
        ]
    )
    rejet = plateforme.client.post(
        "/employees/import",
        headers=headers,
        files={
            "file": ("employes.xlsx", invalide, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        },
    )
    assert rejet.status_code == 400, rejet.text
    assert rejet.json()["crees"] == 0 and rejet.json()["ignores"] == 2 and rejet.json()["totalLignes"] == 2
    assert [ligne["numeroLigne"] for ligne in rejet.json()["lignesIgnorees"]] == [2, 3]


def test_import_employee_fichier_illisible_ou_incomplet_est_un_400_avec_message(
    plateforme: Plateforme, connecter: Any
) -> None:
    headers = _auth(connecter)
    type_xlsx = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    etroit = Workbook()
    feuille = etroit.active
    assert feuille is not None
    feuille.append(["Date d'embauche", "Nom & prénom", "CIN"])
    flux = BytesIO()
    etroit.save(flux)

    illisible = plateforme.client.post(
        "/employees/import", headers=headers, files={"file": ("x.xlsx", b"pas un classeur", type_xlsx)}
    )
    incomplet = plateforme.client.post(
        "/employees/import", headers=headers, files={"file": ("x.xlsx", flux.getvalue(), type_xlsx)}
    )

    assert illisible.status_code == 400
    assert illisible.json()["message"].startswith("Fichier Excel illisible : ")
    assert incomplet.status_code == 400
    assert incomplet.json()["message"] == (
        "Format de fichier invalide : 6 colonnes attendues (Date d'embauche, Nom & prénom, CIN, Fonction, "
        "Chantier, Date de naissance), 3 trouvée(s)."
    )


def test_modele_import_employes_reprend_les_six_entetes_spring(plateforme: Plateforme, connecter: Any) -> None:
    jeton = connecter(*ADMIN)["accessToken"]
    reponse = plateforme.client.get("/employees/import/modele", headers={"Authorization": f"Bearer {jeton}"})

    assert reponse.status_code == 200
    assert reponse.headers["content-disposition"] == "attachment; filename=Modele_Import_Employes.xlsx"
    feuille = load_workbook(BytesIO(reponse.content)).worksheets[0]
    assert feuille.title == "Employés"
    assert [[c.value for c in ligne] for ligne in feuille.iter_rows()] == [
        ["Date d'embauche", "Nom & prénom", "CIN", "Fonction", "Chantier", "Date de naissance"]
    ]


def test_la_reponse_imbrique_fonction_chantier_et_equipe_comme_spring(plateforme: Plateforme, connecter: Any) -> None:
    """Angular lit `employee.fonction.id` : la réponse plate `fonctionId` casserait l'édition d'un employé."""
    entetes = _auth(connecter)
    fonction = plateforme.client.post("/functions", headers=entetes, json={"libelle": "Imbrique fonction"}).json()
    chantier = plateforme.client.post(
        "/chantiers",
        headers=entetes,
        json={"code": "IMB-1", "designation": "Chantier imbriqué", "nature": "AO", "afficherSurCarte": False},
    ).json()
    corps = {
        "nomPrenom": "Imbrique Employe",
        "cin": "CIN-IMB-1",
        "dateNaissance": "1990-01-02",
        "dateEmbauche": "2024-01-02",
        "fonctionId": fonction["id"],
        "chantierId": chantier["id"],
        "statut": "ACTIF",
    }
    cree = plateforme.client.post("/employees", headers=entetes, json=corps)
    assert cree.status_code == 201, cree.text
    attendu = {
        "fonction": {"id": fonction["id"], "libelle": "Imbrique fonction"},
        "chantier": {"id": chantier["id"], "code": "IMB-1", "designation": "Chantier imbriqué"},
        "equipe": None,
    }
    lu = plateforme.client.get(f"/employees/{cree.json()['id']}", headers=entetes).json()
    page = plateforme.client.post("/employees/search", headers=entetes, json={"nomPrenom": "Imbrique"}).json()

    assert {k: cree.json()[k] for k in attendu} == attendu
    assert {k: lu[k] for k in attendu} == attendu
    assert {k: page["content"][0][k] for k in attendu} == attendu
    assert "fonctionId" not in lu and "chantierId" not in lu and "equipeId" not in lu


def test_sorties_du_mois_nomment_l_employe_et_comptent_les_motifs(plateforme: Plateforme, connecter: Any) -> None:
    """Source du futur calcul des STC et du suivi des abandons de poste (décision du propriétaire, 2026-11-07)."""
    from sqlalchemy import text

    entetes = _auth(connecter)
    fonction = plateforme.client.post("/functions", headers=entetes, json={"libelle": "Sortie fonction"}).json()
    chantier = plateforme.client.post(
        "/chantiers",
        headers=entetes,
        json={"code": "SOR-1", "designation": "Chantier sorties", "nature": "AO", "afficherSurCarte": False},
    ).json()
    ids: list[int] = []
    for nom, cin in (("Zoe Sortie", "CIN-SOR-1"), ("Adam Sortie", "CIN-SOR-2")):
        corps = {
            "nomPrenom": nom,
            "cin": cin,
            "dateNaissance": "1990-01-02",
            "dateEmbauche": "2024-01-02",
            "fonctionId": fonction["id"],
            "chantierId": chantier["id"],
        }
        ids.append(plateforme.client.post("/employees", headers=entetes, json=corps).json()["id"])
    with plateforme.moteur.begin() as c:
        for identifiant, motif in zip(ids, ("ABANDON", " "), strict=True):
            c.execute(
                text("INSERT INTO employe_sortie (employee_id, periode, motif) VALUES (:e, 209703, :m)"),
                {"e": identifiant, "m": motif},
            )

    reponse = plateforme.client.post("/employees/sorties-mois", headers=entetes, json={"periode": "2097-03"})
    vide = plateforme.client.post("/employees/sorties-mois", headers=entetes, json={"periode": "2097-04"})
    invalide = plateforme.client.post("/employees/sorties-mois", headers=entetes, json={"periode": "209703"})

    assert reponse.status_code == 200, reponse.text
    assert reponse.json() == {
        "periode": "2097-03",
        "nombre": 2,
        "parMotif": {"ABANDON": 1, "NON_PRECISE": 1},
        "sorties": [
            {
                "employeId": ids[1],
                "nomPrenom": "Adam Sortie",
                "cin": "CIN-SOR-2",
                "periode": "2097-03",
                "motif": "NON_PRECISE",
            },
            {
                "employeId": ids[0],
                "nomPrenom": "Zoe Sortie",
                "cin": "CIN-SOR-1",
                "periode": "2097-03",
                "motif": "ABANDON",
            },
        ],
    }
    assert vide.json() == {"periode": "2097-04", "nombre": 0, "parMotif": {}, "sorties": []}
    assert invalide.status_code == 400

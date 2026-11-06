from datetime import date
from io import BytesIO
from typing import Any

from conftest import ADMIN, Plateforme
from openpyxl import Workbook


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
    assert rejet.status_code == 200 and rejet.json()["crees"] == 0 and rejet.json()["ignores"] == 2

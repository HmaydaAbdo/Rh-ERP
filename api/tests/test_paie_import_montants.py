from io import BytesIO
from typing import Any

from conftest import ADMIN, Plateforme
from openpyxl import Workbook


def test_analyse_nomme_la_cellule_de_montant_et_avertit_sur_salaire_zero(
    plateforme: Plateforme, connecter: Any
) -> None:
    classeur = Workbook()
    feuille = classeur.active
    assert feuille is not None
    for _ in range(3):
        feuille.append([])
    feuille.append(["Amal", None, "AB123", 26, 0, 0, 123.456, 0, 0, 123.456, None, None, None])
    feuille.append(["Omar", None, "AB124", 26, 0, 0, 0, 0, 0, 0, None, None, None])
    contenu = BytesIO()
    classeur.save(contenu)
    jeton = connecter(*ADMIN)["accessToken"]

    reponse = plateforme.client.post(
        "/paie/import/analyse?periode=2026-11",
        headers={"Authorization": f"Bearer {jeton}"},
        files={
            "file": (
                "paie.xlsx",
                contenu.getvalue(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )

    assert reponse.status_code == 200, reponse.text
    analyse = reponse.json()
    assert analyse["periode"] == "2026-11"
    assert any(
        erreur["numeroLigne"] == 4 and erreur["champ"] == "salaireMensuel" and erreur["valeur"] == "123.456"
        for erreur in analyse["erreurs"]
    )
    assert any(
        avertissement["numeroLigne"] == 5 and avertissement["champ"] == "salaireMensuel"
        for avertissement in analyse["avertissements"]
    )

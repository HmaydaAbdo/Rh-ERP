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
    feuille.append(["Nadia", "Fonction absente", "AB125", 1000, 0, 0, 4500, 0, 0, 4500, None, "X404", "E404"])
    contenu = BytesIO()
    classeur.save(contenu)
    jeton = connecter(*ADMIN)["accessToken"]

    reponse = plateforme.client.post(
        "/paie/import/analyse",
        headers={"Authorization": f"Bearer {jeton}"},
        data={"periode": "2026-11"},
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
        avertissement["numeroLigne"] == 5
        and avertissement["champ"] == "salaireMensuel"
        and avertissement["codeAvertissement"] == "SALAIRE_ZERO"
        and avertissement["typeSalairePropose"] == "JOURNALIER"
        for avertissement in analyse["avertissements"]
    )
    assert any(
        erreur["numeroLigne"] == 6 and erreur["champ"] == "nombreJoursTravailles" and erreur["valeur"] == "1000"
        for erreur in analyse["erreurs"]
    )
    assert {
        erreur["champ"]
        for erreur in analyse["erreurs"]
        if erreur["numeroLigne"] == 6 and "introuvable" in erreur["raison"]
    } == {"fonction", "chantier", "equipe"}

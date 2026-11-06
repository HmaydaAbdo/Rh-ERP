from typing import Any

from conftest import ADMIN, Plateforme


def test_rapport_incomplet_ne_peut_pas_etre_telecharge(plateforme: Plateforme, connecter: Any) -> None:
    jeton = connecter(*ADMIN)["accessToken"]
    reponse = plateforme.client.post(
        "/paie/report/pdf", headers={"Authorization": f"Bearer {jeton}"}, json={"periode": "2026-10"}
    )
    assert reponse.status_code == 503
    assert reponse.headers["content-type"].startswith("application/json")
    assert "temporairement indisponible" in reponse.json()["message"]

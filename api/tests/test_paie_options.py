from typing import Any

from conftest import ADMIN, Plateforme


def test_filtres_paie_acceptent_le_mois_et_le_tri_du_frontend(plateforme: Plateforme, connecter: Any) -> None:
    jeton = connecter(*ADMIN)["accessToken"]
    entetes = {"Authorization": f"Bearer {jeton}"}
    chantiers = plateforme.client.post(
        "/paie/options/chantiers?page=0&size=30&sort=code,asc",
        headers=entetes,
        json={"periode": "2026-11"},
    )
    equipes = plateforme.client.post(
        "/paie/options/equipes?page=0&size=30&sort=libelle,asc",
        headers=entetes,
        json={"periode": "2026-11", "chantierIds": [1]},
    )
    assert chantiers.status_code == 200, chantiers.text
    assert equipes.status_code == 200, equipes.text
    assert chantiers.json()["content"] == []
    assert equipes.json()["content"] == []

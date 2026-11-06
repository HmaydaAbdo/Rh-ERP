"""Parité du référentiel equipe : normalisation, unicité, recherche et audit."""

from typing import Any

from conftest import ADMIN, Plateforme


def test_crud_equipe_normalise_code_et_libelle(plateforme: Plateforme, connecter: Any) -> None:
    connexion = connecter(*ADMIN)
    entete = {"Authorization": f"Bearer {connexion['accessToken']}"}
    creee = plateforme.client.post("/equipes", headers=entete, json={"code": " zzt ", "libelle": "  Chauffeurs test  "})
    assert creee.status_code == 201
    equipe = creee.json()
    assert equipe["code"] == "ZZT" and equipe["libelle"] == "Chauffeurs test"
    doublon = plateforme.client.post("/equipes", headers=entete, json={"code": "zzt", "libelle": "Autre"})
    assert doublon.status_code == 409
    recherche = plateforme.client.post("/equipes/search", headers=entete, json={"recherche": "chauff"})
    assert recherche.status_code == 200
    assert any(ligne["code"] == "ZZT" for ligne in recherche.json()["content"])
    assert plateforme.client.delete(f"/equipes/{equipe['id']}", headers=entete).status_code == 204

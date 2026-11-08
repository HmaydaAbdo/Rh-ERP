"""Parité du référentiel function avec Spring : CRUD, recherche, version et audit."""

from typing import Any

from conftest import ADMIN, Plateforme
from sqlalchemy import text


def _entete(connexion: dict[str, Any]) -> dict[str, str]:
    return {"Authorization": f"Bearer {connexion['accessToken']}"}


def test_crud_fonction_et_recherche_sont_proteges_et_audites(plateforme: Plateforme, connecter: Any) -> None:
    assert plateforme.client.post("/functions", json={"libelle": "Chef de projet"}).status_code == 401
    connexion = connecter(*ADMIN)
    entete = _entete(connexion)

    creee = plateforme.client.post("/functions", headers=entete, json={"libelle": "  Chef de projet  "})
    assert creee.status_code == 201
    fonction = creee.json()
    assert fonction["libelle"] == "Chef de projet"
    identifiant = fonction["id"]

    recherche = plateforme.client.post("/functions/search", headers=entete, json={"libelle": "projet"})
    assert recherche.status_code == 200
    assert [ligne["id"] for ligne in recherche.json()["content"]] == [identifiant]

    modifiee = plateforme.client.put(
        f"/functions/{identifiant}", headers=entete, json={"version": fonction["version"], "libelle": "Conducteur"}
    )
    assert modifiee.status_code == 200 and modifiee.json()["libelle"] == "Conducteur"
    conflit = plateforme.client.put(
        f"/functions/{identifiant}", headers=entete, json={"version": fonction["version"], "libelle": "Autre"}
    )
    assert conflit.status_code == 409

    assert plateforme.client.delete(f"/functions/{identifiant}", headers=entete).status_code == 204
    assert plateforme.client.get(f"/functions/{identifiant}", headers=entete).status_code == 404
    with plateforme.moteur.connect() as connexion:
        entites = set(
            connexion.execute(
                text("SELECT entite FROM audit_revision_entite WHERE entite = 'staport.rh.function.entities.Function'")
            ).scalars()
        )
    assert entites == {"staport.rh.function.entities.Function"}


def test_la_version_demarre_a_zero_et_s_incremente_comme_hibernate(plateforme: Plateforme, connecter: Any) -> None:
    """Écart trouvé par le banc différentiel (KAN-226) : SQLAlchemy démarrait à 1, Spring à 0."""
    entete = _entete(connecter(*ADMIN))
    creee = plateforme.client.post("/functions", headers=entete, json={"libelle": "Version zéro"}).json()
    assert creee["version"] == 0
    modifiee = plateforme.client.put(
        f"/functions/{creee['id']}", headers=entete, json={"version": 0, "libelle": "Version un"}
    )
    assert modifiee.json()["version"] == 1

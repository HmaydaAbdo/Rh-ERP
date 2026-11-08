"""Filtres de la recherche d'employés, règles de saisie et modification (parité de `EmployeeSpecification`)."""

import uuid
from typing import Any

import pytest
from conftest import ADMIN, Plateforme


def _auth(connecter: Any) -> dict[str, str]:
    return {"Authorization": f"Bearer {connecter(*ADMIN)['accessToken']}"}


@pytest.fixture
def jeu(plateforme: Plateforme, connecter: Any) -> dict[str, Any]:
    """Une fonction, un chantier, une équipe et trois employés : avec équipe, sans équipe, puis inactif."""
    entetes = _auth(connecter)
    client = plateforme.client
    suffixe = uuid.uuid4().hex[:6]
    fonction = client.post("/functions", headers=entetes, json={"libelle": f"Recherche fonction {suffixe}"}).json()
    chantier = client.post(
        "/chantiers",
        headers=entetes,
        json={"code": f"REC-{suffixe}", "designation": "Chantier recherche", "nature": "AO", "afficherSurCarte": False},
    ).json()
    equipe = client.post(
        "/equipes", headers=entetes, json={"code": f"EQ-{suffixe}", "libelle": f"Équipe recherche {suffixe}"}
    ).json()

    def corps(nom: str, cin: str, equipe_id: int | None) -> dict[str, Any]:
        return {
            "nomPrenom": nom,
            "cin": cin,
            "dateNaissance": "1990-01-02",
            "dateEmbauche": "2024-01-02",
            "fonctionId": fonction["id"],
            "chantierId": chantier["id"],
            "equipeId": equipe_id,
            "statut": "ACTIF",
        }

    def creer(nom: str, cin: str, equipe_id: int | None) -> dict[str, Any]:
        reponse = client.post("/employees", headers=entetes, json=corps(nom, cin, equipe_id))
        assert reponse.status_code == 201, reponse.text
        return reponse.json()

    noms = {cle: f"Rech{suffixe} {cle}" for cle in ("avec", "sans", "sorti")}
    avec = creer(noms["avec"], f"CIN-{suffixe}-1", equipe["id"])
    sans = creer(noms["sans"], f"CIN-{suffixe}-2", None)
    sorti = creer(noms["sorti"], f"CIN-{suffixe}-3", None)
    modif = client.put(
        f"/employees/{sorti['id']}",
        headers=entetes,
        json={
            **corps(noms["sorti"], sorti["cin"], None),
            "version": sorti["version"],
            "chantierId": None,
            "statut": "INACTIF",
        },
    )
    assert modif.status_code == 200, modif.text
    return {
        "entetes": entetes,
        "client": client,
        "fonction": fonction,
        "chantier": chantier,
        "equipe": equipe,
        "avec": avec,
        "sans": sans,
        "sorti": sorti,
        "noms": noms,
        "motif": f"Rech{suffixe}",
        "corps": corps,
    }


def _noms(jeu: dict[str, Any], **criteres: Any) -> set[str]:
    page = jeu["client"].post("/employees/search", headers=jeu["entetes"], json=criteres)
    assert page.status_code == 200, page.text
    return {e["nomPrenom"] for e in page.json()["content"]}


def test_les_filtres_de_recherche_se_combinent(jeu: dict[str, Any]) -> None:
    n, motif = jeu["noms"], jeu["motif"].lower()
    tous = set(n.values())
    assert _noms(jeu, nomPrenom=motif) == tous
    assert _noms(jeu, cin=jeu["sans"]["cin"].lower()) == {n["sans"]}
    assert _noms(jeu, nomPrenom=motif, fonctionIds=[jeu["fonction"]["id"]]) == tous
    assert _noms(jeu, nomPrenom=motif, chantierIds=[jeu["chantier"]["id"]]) == {n["avec"], n["sans"]}
    assert _noms(jeu, nomPrenom=motif, equipeIds=[jeu["equipe"]["id"]]) == {n["avec"]}
    assert _noms(jeu, nomPrenom=motif, equipeIds=[0]) == {n["sans"], n["sorti"]}
    assert _noms(jeu, nomPrenom=motif, equipeIds=[0, jeu["equipe"]["id"]]) == tous
    assert _noms(jeu, nomPrenom=motif, statut="INACTIF") == {n["sorti"]}
    assert _noms(jeu, nomPrenom="   ", cin="  ", statut="INACTIF") >= {n["sorti"]}


def test_saisie_invalide_refusee(jeu: dict[str, Any]) -> None:
    base = jeu["corps"]("Invalide", f"CIN-INV-{uuid.uuid4().hex[:6]}", None)
    for variante in (
        {"salaire": 4000},  # salaire sans type
        {"typeSalaire": "MENSUEL"},  # type sans salaire
        {"dateNaissance": "2999-01-01"},  # naissance future
    ):
        reponse = jeu["client"].post("/employees", headers=jeu["entetes"], json={**base, **variante})
        assert reponse.status_code == 400, (variante, reponse.text)
    modification = {**base, "version": jeu["avec"]["version"], "statut": "INACTIF"}  # un inactif n'a pas de chantier
    reponse = jeu["client"].put(f"/employees/{jeu['avec']['id']}", headers=jeu["entetes"], json=modification)
    assert reponse.status_code == 400, reponse.text
    actif_sans_chantier = {**modification, "statut": "ACTIF", "chantierId": None}
    reponse = jeu["client"].put(f"/employees/{jeu['avec']['id']}", headers=jeu["entetes"], json=actif_sans_chantier)
    assert reponse.status_code == 400, reponse.text


def test_references_inconnues_et_doublon_de_cin_refuses(jeu: dict[str, Any]) -> None:
    base = jeu["corps"]("Reference", f"CIN-REF-{uuid.uuid4().hex[:6]}", None)
    for variante in ({"fonctionId": 999_999}, {"chantierId": 999_999}, {"equipeId": 999_999}):
        reponse = jeu["client"].post("/employees", headers=jeu["entetes"], json={**base, **variante})
        assert reponse.status_code in (400, 404), (variante, reponse.text)
    doublon = jeu["client"].post("/employees", headers=jeu["entetes"], json={**base, "cin": jeu["avec"]["cin"].lower()})
    assert doublon.status_code == 409, doublon.text
    assert jeu["client"].get("/employees/999999", headers=jeu["entetes"]).status_code == 404

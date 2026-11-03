# Le client de test de Starlette n'expose pas de types complets : cette règle n'est levée que pour ce fichier.
# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false, reportUnknownArgumentType=false
"""Parité du domaine `common` avec Spring (KAN-47) : format d'erreur, messages, identifiant de requête, recherche."""

import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field

from staport.domains.common.api import motif_contient, verifier_version
from staport.main import creer_app
from staport.platform.erreurs import AccesRefuse, ConflitModification
from staport.platform.requete import EN_TETE_REQUEST_ID, request_id_courant


class Saisie(BaseModel):
    nom: str = Field(min_length=1)
    age: int


def _app() -> FastAPI:
    app = creer_app()

    @app.get("/conflit")
    async def conflit() -> None:  # pyright: ignore[reportUnusedFunction]
        verifier_version(1, 2)

    @app.get("/refus")
    async def refus() -> None:  # pyright: ignore[reportUnusedFunction]
        raise AccesRefuse

    @app.get("/panne")
    async def panne() -> None:  # pyright: ignore[reportUnusedFunction]
        raise RuntimeError("détail interne à ne jamais exposer")

    @app.post("/saisie")
    async def saisie(corps: Saisie) -> Saisie:  # pyright: ignore[reportUnusedFunction]
        return corps

    @app.get("/identifiant")
    async def identifiant() -> dict[str, str | None]:  # pyright: ignore[reportUnusedFunction]
        return {"requestId": request_id_courant()}

    return app


@pytest.fixture
def client() -> TestClient:
    return TestClient(_app(), raise_server_exceptions=False)


def _forme_spring(corps: dict[str, object], statut: int, erreur: str, message: str, chemin: str) -> None:
    assert set(corps) == {"timestamp", "status", "error", "message", "path"}
    assert corps["status"] == statut
    assert corps["error"] == erreur
    assert corps["message"] == message
    assert corps["path"] == chemin
    assert isinstance(corps["timestamp"], str)


def test_conflit_de_version_donne_409_avec_le_message_spring(client: TestClient) -> None:
    r = client.get("/conflit")
    assert r.status_code == 409
    _forme_spring(
        r.json(),
        409,
        "Conflict",
        "L'enregistrement a été modifié depuis son chargement. Rechargez-le avant de réessayer.",
        "/conflit",
    )


def test_acces_refuse_donne_403(client: TestClient) -> None:
    r = client.get("/refus")
    assert r.status_code == 403
    _forme_spring(r.json(), 403, "Forbidden", "Permission insuffisante pour effectuer cette action.", "/refus")


def test_route_inconnue_donne_404_et_methode_inconnue_405(client: TestClient) -> None:
    r = client.get("/nulle-part")
    assert r.status_code == 404
    _forme_spring(r.json(), 404, "Not Found", "Route introuvable.", "/nulle-part")
    r = client.delete("/saisie")
    assert r.status_code == 405
    _forme_spring(r.json(), 405, "Method Not Allowed", "Méthode non autorisée pour cette route.", "/saisie")


def test_erreur_imprevue_ne_fuite_aucun_detail(client: TestClient) -> None:
    r = client.get("/panne")
    assert r.status_code == 500
    _forme_spring(r.json(), 500, "Internal Server Error", "Une erreur inattendue est survenue.", "/panne")
    assert "interne" not in r.text


def test_validation_donne_400_avec_champ_et_message(client: TestClient) -> None:
    r = client.post("/saisie", json={"nom": "", "age": "x"})
    assert r.status_code == 400
    corps = r.json()
    assert corps["status"] == 400 and corps["error"] == "Bad Request"
    assert corps["message"] == "nom : Doit contenir au moins 1 caractère(s)., age : Un nombre entier est attendu."


def test_corps_illisible_donne_400_message_spring(client: TestClient) -> None:
    r = client.post("/saisie", content=b"{pas du json", headers={"content-type": "application/json"})
    assert r.status_code == 400
    assert r.json()["message"] == "Corps de la requête illisible."


def test_identifiant_de_requete_est_genere_jamais_repris_du_client(client: TestClient) -> None:
    r = client.get("/identifiant", headers={EN_TETE_REQUEST_ID: "choisi-par-le-client"})
    envoye = r.headers[EN_TETE_REQUEST_ID]
    assert envoye != "choisi-par-le-client"
    assert str(uuid.UUID(envoye)) == envoye
    assert r.json()["requestId"] == envoye
    assert request_id_courant() is None


def test_motif_de_recherche_echappe_les_jokers() -> None:
    assert motif_contient("100%") == "%100\\%%"
    assert motif_contient("a_b") == "%a\\_b%"
    assert motif_contient("A\\B") == "%a\\\\b%"
    assert motif_contient("Texte") == "%texte%"


def test_version_identique_ne_leve_pas() -> None:
    verifier_version(3, 3)
    verifier_version(None, None)
    with pytest.raises(ConflitModification):
        verifier_version(3, 4)


def test_les_types_pydantic_frequents_sont_traduits_et_sans_anglais() -> None:
    from pydantic import TypeAdapter, ValidationError
    from pydantic.types import conint, constr

    from staport.platform.validation_fr import message_fr, types_traduits

    cas = [
        (constr(max_length=2), "abc", "string_too_long"),
        (conint(ge=1), 0, "greater_than_equal"),
        (conint(lt=5), 9, "less_than"),
        (list[int], "x", "list_type"),
    ]
    for type_, valeur, attendu in cas:
        with pytest.raises(ValidationError) as info:
            TypeAdapter(type_).validate_python(valeur)
        detail = info.value.errors()[0]
        assert detail["type"] == attendu and attendu in types_traduits()
        assert message_fr(detail) != detail["msg"]
    assert message_fr({"type": "inconnu", "msg": "original"}) == "original"

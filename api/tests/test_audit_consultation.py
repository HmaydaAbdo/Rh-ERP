"""Parité de la consultation du journal avec Spring (KAN-214) : `AuditConsultationTest` sur un PostgreSQL réel.

Les 4 routes `/logs/...`, leur détail champ par champ, l'historique d'un enregistrement, les filtres et les tris.
"""

# Le client de test de Starlette n'expose pas de types complets : cette règle n'est levée que pour ce fichier.
# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false, reportUnknownArgumentType=false

import uuid
from collections.abc import Callable
from typing import Any

import pytest
from conftest import Plateforme
from sqlalchemy import text

from staport.domains.audit.consultation import COLONNES_TRIABLES


@pytest.fixture
def admin(plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]]) -> dict[str, str]:
    acces = connecter("admin-essai", "mdp-admin-essai-123")["accessToken"]
    plateforme.client.cookies.clear()
    return {"Authorization": f"Bearer {acces}"}


def _unique(prefixe: str) -> str:
    return f"{prefixe}-{uuid.uuid4().hex[:8]}"


def _permission(p: Plateforme, code: str) -> int:
    with p.moteur.connect() as c:
        return c.execute(text("SELECT id FROM permission WHERE code = :c"), {"c": code}).scalar_one()


def _entree_de(p: Plateforme, admin: dict[str, str], reponse: Any) -> dict[str, Any]:
    """L'entrée du journal produite par une requête, retrouvée par l'API de recherche elle-même."""
    page = p.client.post("/logs/search", headers=admin, json={"requestId": reponse.headers["X-Request-Id"]}).json()
    assert page["page"]["totalElements"] == 1, page
    return page["content"][0]


def _details(p: Plateforme, admin: dict[str, str], entree: dict[str, Any], **parametres: Any) -> dict[str, Any]:
    reponse = p.client.get(f"/logs/{entree['id']}/details", headers=admin, params=parametres)
    assert reponse.status_code == 200, reponse.text
    return reponse.json()


def _creer_role(p: Plateforme, admin: dict[str, str], permissions: tuple[str, ...]) -> Any:
    corps = {
        "nom": _unique("role"),
        "description": "Rôle d'essai",
        "permissionIds": [_permission(p, c) for c in permissions],
    }
    return p.client.post("/roles", headers=admin, json=corps)


# --- Détail d'une opération ----------------------------------------------------------------------------


def test_le_detail_d_une_creation_donne_les_valeurs_apres_avec_les_relations_en_identifiant_et_libelle(
    plateforme: Plateforme, admin: dict[str, str]
) -> None:
    creation = _creer_role(plateforme, admin, ("EQUIPE_WRITE",))
    role = creation.json()
    detail = _details(plateforme, admin, _entree_de(plateforme, admin, creation))

    assert detail["page"]["totalElements"] == 1
    changement = detail["content"][0]
    assert (changement["entiteType"], changement["entiteId"], changement["operation"]) == ("Role", role["id"], "AJOUT")
    assert changement["libelle"] == role["nom"]
    champs = {c["champ"]: c for c in changement["champs"]}
    assert champs["nom"] == {"champ": "nom", "avant": None, "apres": role["nom"], "ajoutes": None, "retires": None}
    assert champs["permissions"]["ajoutes"] == [f"{_permission(plateforme, 'EQUIPE_WRITE')} — EQUIPE_WRITE"]
    assert [c["champ"] for c in changement["champs"]] == sorted(champs)  # ordre alphabétique des champs


def test_le_detail_d_une_modification_ne_montre_que_ce_qui_a_change_avec_son_avant_et_son_apres(
    plateforme: Plateforme, admin: dict[str, str]
) -> None:
    role = _creer_role(plateforme, admin, ("EQUIPE_WRITE",)).json()
    corps = {
        "nom": role["nom"],
        "description": "Nouvelle description",
        "permissionIds": [_permission(plateforme, "USER_MANAGE")],
        "version": role["version"],
    }
    modification = plateforme.client.put(f"/roles/{role['id']}", headers=admin, json=corps)
    assert modification.status_code == 200, modification.text

    changement = _details(plateforme, admin, _entree_de(plateforme, admin, modification))["content"][0]
    assert changement["operation"] == "MODIFICATION"
    champs = {c["champ"]: c for c in changement["champs"]}
    assert set(champs) == {"description", "permissions"}  # le nom n'a pas changé : il n'apparaît pas
    assert (champs["description"]["avant"], champs["description"]["apres"]) == ("Rôle d'essai", "Nouvelle description")
    assert champs["permissions"]["ajoutes"] == [f"{_permission(plateforme, 'USER_MANAGE')} — USER_MANAGE"]
    assert champs["permissions"]["retires"] == [f"{_permission(plateforme, 'EQUIPE_WRITE')} — EQUIPE_WRITE"]


def test_le_detail_d_une_suppression_garde_les_valeurs_d_avant_du_contenu_supprime(
    plateforme: Plateforme, admin: dict[str, str]
) -> None:
    role = _creer_role(plateforme, admin, ("EQUIPE_WRITE",)).json()
    suppression = plateforme.client.delete(f"/roles/{role['id']}", headers=admin)

    changement = _details(plateforme, admin, _entree_de(plateforme, admin, suppression))["content"][0]
    assert changement["operation"] == "SUPPRESSION"
    assert changement["libelle"] == role["nom"]
    champs = {c["champ"]: c for c in changement["champs"]}
    assert (champs["nom"]["avant"], champs["nom"]["apres"]) == (role["nom"], None)
    assert champs["permissions"]["retires"] == [f"{_permission(plateforme, 'EQUIPE_WRITE')} — EQUIPE_WRITE"]


def test_les_droits_d_un_compte_se_lisent_comme_des_elements_ajoutes_et_retires_sans_aucun_mot_de_passe(
    plateforme: Plateforme, admin: dict[str, str]
) -> None:
    role = _creer_role(plateforme, admin, ("EQUIPE_WRITE",)).json()
    nom = _unique("cpt")
    creation = plateforme.client.post(
        "/users",
        headers=admin,
        json={
            "username": nom,
            "email": f"{nom}@example.org",
            "motDePasse": "mot-de-passe-valide",
            "employeeId": None,
            "roleIds": [role["id"]],
        },
    )
    assert creation.status_code == 201, creation.text

    changement = _details(plateforme, admin, _entree_de(plateforme, admin, creation))["content"][0]
    champs = {c["champ"]: c for c in changement["champs"]}
    assert champs["roles"]["ajoutes"] == [f"{role['id']} — {role['nom']}"]
    assert set(champs) == {"actif", "email", "roles", "username"}  # ni hash, ni verrouillage, ni version
    assert "mot-de-passe-valide" not in str(changement)


def test_une_operation_echouee_ou_sans_revision_a_un_detail_vide(plateforme: Plateforme, admin: dict[str, str]) -> None:
    reponse = plateforme.client.post(
        "/roles", headers=admin, json={"nom": _unique("rejet"), "description": None, "permissionIds": [999_999_999]}
    )
    detail = _details(plateforme, admin, _entree_de(plateforme, admin, reponse))
    assert detail["content"] == []
    assert detail["page"]["totalElements"] == 0


def test_le_detail_est_pagine(plateforme: Plateforme, admin: dict[str, str]) -> None:
    role = _creer_role(plateforme, admin, ("EQUIPE_WRITE", "USER_MANAGE")).json()
    suppression = plateforme.client.delete(f"/roles/{role['id']}", headers=admin)
    entree = _entree_de(plateforme, admin, suppression)
    page = _details(plateforme, admin, entree, size=1, page=0)
    assert (page["page"]["size"], page["page"]["totalElements"], len(page["content"])) == (1, 1, 1)
    assert _details(plateforme, admin, entree, size=1, page=1)["content"] == []


# --- Historique d'un enregistrement ----------------------------------------------------------------------


def test_l_historique_d_un_enregistrement_liste_ses_versions_de_la_plus_recente_a_la_plus_ancienne(
    plateforme: Plateforme, admin: dict[str, str]
) -> None:
    role = _creer_role(plateforme, admin, ("EQUIPE_WRITE",)).json()
    corps = {
        "nom": role["nom"],
        "description": "Deuxième version",
        "permissionIds": [_permission(plateforme, "EQUIPE_WRITE")],
        "version": role["version"],
    }
    assert plateforme.client.put(f"/roles/{role['id']}", headers=admin, json=corps).status_code == 200

    reponse = plateforme.client.get(f"/logs/historique/role/{role['id']}", headers=admin)  # nom insensible à la casse
    assert reponse.status_code == 200, reponse.text
    versions = reponse.json()["content"]
    assert [v["operation"] for v in versions] == ["MODIFICATION", "AJOUT"]
    assert versions[0]["utilisateurNom"] == "admin-essai"
    assert versions[0]["origine"] == "API"
    assert versions[0]["revision"] > versions[1]["revision"]
    assert [c["champ"] for c in versions[0]["champs"]] == ["description"]
    assert {c["champ"] for c in versions[1]["champs"]} >= {"nom", "description", "permissions"}


def test_une_entite_ou_une_entree_inconnue_est_introuvable(plateforme: Plateforme, admin: dict[str, str]) -> None:
    inconnue = plateforme.client.get("/logs/historique/imaginaire/1", headers=admin)
    assert inconnue.status_code == 404
    assert inconnue.json()["message"] == "Entité auditée inconnue : imaginaire"
    absente = plateforme.client.get("/logs/999999999", headers=admin)
    assert absente.status_code == 404
    assert absente.json()["message"] == "Entrée de journal introuvable avec l'id : 999999999"
    assert plateforme.client.get("/logs/999999999/details", headers=admin).status_code == 404


# --- Recherche -----------------------------------------------------------------------------------------------


def test_la_recherche_filtre_par_utilisateur_categorie_action_et_dates_sans_interpreter_les_jokers(
    plateforme: Plateforme, admin: dict[str, str]
) -> None:
    role = _creer_role(plateforme, admin, ("EQUIPE_WRITE",))
    entree = _entree_de(plateforme, admin, role)

    def chercher(**criteres: Any) -> list[dict[str, Any]]:
        reponse = plateforme.client.post("/logs/search", headers=admin, json=criteres)
        assert reponse.status_code == 200, reponse.text
        return reponse.json()["content"]

    assert entree["id"] in {e["id"] for e in chercher(utilisateur="ADMIN-ess", action="ROLE_CREATION")}
    assert chercher(utilisateur="%", action="ROLE_CREATION") == []  # '%' est du texte, pas un joker
    assert chercher(utilisateur="admin_essai") == []  # '_' non plus
    assert all(e["categorie"] == "SECURITE" for e in chercher(categorie="SECURITE"))
    assert all(e["resultat"] == "ECHEC" for e in chercher(resultat="ECHEC"))
    assert chercher(dateDebut="2999-01-01T00:00:00Z") == []
    assert chercher(dateFin="2000-01-01T00:00:00Z") == []
    assert [e["id"] for e in chercher(entiteType="Role", entiteId=entree["entiteId"], action="ROLE_CREATION")] == [
        entree["id"]
    ]


def test_les_filtres_multiselect_du_journal_combinent_les_valeurs_par_inclusion(
    plateforme: Plateforme, admin: dict[str, str]
) -> None:
    _creer_role(plateforme, admin, ("EQUIPE_WRITE",))
    plateforme.client.post("/auth/login", json={"username": "inconnu-multi", "password": "x"})
    reponse = plateforme.client.post(
        "/logs/search",
        headers=admin,
        json={
            "categories": ["OPERATION", "SECURITE"],
            "actions": ["ROLE_CREATION", "CONNEXION_ECHOUEE"],
            "entiteTypes": ["Role"],
        },
        params={"size": 200},
    )
    assert reponse.status_code == 200, reponse.text
    contenu = reponse.json()["content"]
    assert contenu
    assert {e["action"] for e in contenu} == {"ROLE_CREATION"}  # entiteTypes écarte les événements sans entité
    vide = plateforme.client.post("/logs/search", headers=admin, json={"actions": ["  "]})
    assert vide.status_code == 400


@pytest.mark.parametrize("propriete", sorted(COLONNES_TRIABLES))
def test_chaque_colonne_triable_du_journal_est_un_chemin_de_tri_valide(
    plateforme: Plateforme, admin: dict[str, str], propriete: str
) -> None:
    reponse = plateforme.client.post("/logs/search", headers=admin, json={}, params={"sort": f"{propriete},desc"})
    assert reponse.status_code == 200, reponse.text


def test_un_tri_inconnu_est_refuse_et_la_taille_est_plafonnee(plateforme: Plateforme, admin: dict[str, str]) -> None:
    assert (
        plateforme.client.post("/logs/search", headers=admin, json={}, params={"sort": "perimetre"}).status_code == 400
    )
    page = plateforme.client.post("/logs/search", headers=admin, json={}, params={"size": 5000}).json()
    assert page["page"]["size"] == 200


def test_une_entree_se_lit_avec_son_perimetre_decode(plateforme: Plateforme, admin: dict[str, str]) -> None:
    plateforme.client.get("/users/12345")  # 401 anonyme : l'entrée porte un périmètre JSON
    page = plateforme.client.post(
        "/logs/search", headers=admin, json={"action": "ACCES_ANONYME_REFUSE"}, params={"size": 1}
    ).json()
    entree = plateforme.client.get(f"/logs/{page['content'][0]['id']}", headers=admin).json()
    assert entree["perimetre"] == {"methode": "GET", "route": "/users/{id}", "statutHttp": 401}
    assert entree["requestId"] and entree["origine"] == "API"
    assert {"adresseIp", "userAgent", "revisionId"} <= set(entree)


# --- Droits et lecture seule ------------------------------------------------------------------------------------


def test_la_consultation_exige_la_permission_d_audit(
    plateforme: Plateforme, creer_utilisateur: Callable[..., Any], connecter: Callable[[str, str], dict[str, Any]]
) -> None:
    identifiant, mot_de_passe = creer_utilisateur()
    with plateforme.moteur.connect() as c:
        nom = c.execute(text("SELECT username FROM utilisateur WHERE id = :i"), {"i": identifiant}).scalar_one()
    acces = {"Authorization": f"Bearer {connecter(nom, mot_de_passe)['accessToken']}"}
    plateforme.client.cookies.clear()
    for methode, chemin in (
        ("POST", "/logs/search"),
        ("GET", "/logs/1"),
        ("GET", "/logs/1/details"),
        ("GET", "/logs/historique/role/1"),
    ):
        assert plateforme.client.request(methode, chemin, headers=acces).status_code == 403, chemin
        assert plateforme.client.request(methode, chemin).status_code == 401, chemin


def test_aucune_route_ne_modifie_ni_ne_supprime_le_journal(plateforme: Plateforme, admin: dict[str, str]) -> None:
    for methode in ("PUT", "PATCH", "DELETE"):
        assert plateforme.client.request(methode, "/logs/1", headers=admin).status_code == 405
    assert plateforme.client.post("/logs/1", headers=admin).status_code == 405
    chemins = plateforme.app.openapi()["paths"]
    logs = {(m.upper(), c) for c, operations in chemins.items() if c.startswith("/logs") for m in operations}
    assert logs == {
        ("POST", "/logs/search"),
        ("GET", "/logs/{identifiant}"),
        ("GET", "/logs/{identifiant}/details"),
        ("GET", "/logs/historique/{entite}/{identifiant}"),
    }

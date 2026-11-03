"""Parité du domaine auth avec Spring (KAN-213) : comptes, rôles, permissions, recherche, validation, courriel.

Reprend `RoleAdministrationProtegeeTest`, `AuthRequestValidationTest`, `AuthRechercheTest`, `EmailServiceTest` et
le comportement des services `UserService` / `RoleService`, sur un PostgreSQL réel par l'API HTTP.
"""

# Le client de test de Starlette n'expose pas de types complets : cette règle n'est levée que pour ce fichier.
# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false, reportUnknownArgumentType=false

import asyncio
import uuid
from collections.abc import Callable
from datetime import timedelta
from typing import Any

import aiosmtplib
import pytest
from conftest import Plateforme, construire_configuration
from pydantic import ValidationError
from sqlalchemy import text

from staport.domains.auth.courriel import (
    FileSaturee,
    ServiceCourriel,
    composer_lien_reinitialisation,
    libelle_duree,
)
from staport.domains.auth.schemas import (
    RoleCreationRequete,
    RoleModificationRequete,
    UtilisateurCreationRequete,
    UtilisateurModificationRequete,
)
from staport.domains.common.securite import ActionSecurite as Action

Fabrique = Callable[..., tuple[int, str]]


@pytest.fixture
def admin(plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]]) -> dict[str, str]:
    acces = connecter("admin-essai", "mdp-admin-essai-123")["accessToken"]
    plateforme.client.cookies.clear()
    return {"Authorization": f"Bearer {acces}"}


def _unique(prefixe: str) -> str:
    return f"{prefixe}-{uuid.uuid4().hex[:8]}"


def _creer_compte(p: Plateforme, admin: dict[str, str], prefixe: str = "cpt", **remplacements: Any) -> dict[str, Any]:
    nom = _unique(prefixe)
    corps = {
        "username": nom,
        "email": f"{nom}@example.org",
        "motDePasse": "mot-de-passe-valide",
        "employeeId": None,
        "roleIds": [],
        **remplacements,
    }
    reponse = p.client.post("/users", headers=admin, json=corps)
    assert reponse.status_code == 201, reponse.text
    return reponse.json()


def _id_role(p: Plateforme, nom: str) -> int:
    with p.moteur.connect() as c:
        return c.execute(text("SELECT id FROM role WHERE nom = :n"), {"n": nom}).scalar_one()


def _id_permission(p: Plateforme, code: str) -> int:
    with p.moteur.connect() as c:
        return c.execute(text("SELECT id FROM permission WHERE code = :c"), {"c": code}).scalar_one()


# --- Comptes --------------------------------------------------------------------------------------


def test_creer_un_compte_attribue_les_roles_et_calcule_les_permissions(
    plateforme: Plateforme, admin: dict[str, str]
) -> None:
    role = _id_role(plateforme, "SYSTEM_ADMIN")
    compte = _creer_compte(plateforme, admin, roleIds=[role])
    assert compte["actif"] is True and compte["version"] >= 0 and compte["employee"] is None
    assert [r["nom"] for r in compte["roles"]] == ["SYSTEM_ADMIN"]
    assert "USER_MANAGE" in compte["permissionsEffectives"] and compte["permissionsRefusees"] == []
    assert compte["permissionsEffectives"] == sorted(compte["permissionsEffectives"])
    with plateforme.moteur.connect() as c:
        empreinte = c.execute(
            text("SELECT mot_de_passe_hash FROM utilisateur WHERE id = :i"), {"i": compte["id"]}
        ).scalar_one()
    assert empreinte.startswith("$argon2") and "mot-de-passe-valide" not in empreinte
    assert "motDePasse" not in compte and "motDePasseHash" not in compte


def test_creer_un_compte_refuse_les_doublons_sans_tenir_compte_de_la_casse(
    plateforme: Plateforme, admin: dict[str, str]
) -> None:
    compte = _creer_compte(plateforme, admin)
    memes_nom = plateforme.client.post(
        "/users",
        headers=admin,
        json={
            "username": compte["username"].upper(),
            "email": f"{_unique('x')}@example.org",
            "motDePasse": "assez-long-mdp",
            "roleIds": [],
        },
    )
    assert memes_nom.status_code == 409
    assert memes_nom.json()["message"] == f"Ce nom d'utilisateur est déjà utilisé : {compte['username'].upper()}"
    meme_email = plateforme.client.post(
        "/users",
        headers=admin,
        json={
            "username": _unique("y"),
            "email": compte["email"].upper(),
            "motDePasse": "assez-long-mdp",
            "roleIds": [],
        },
    )
    assert meme_email.status_code == 409 and meme_email.json()["message"].startswith("Cet email est déjà utilisé : ")


def test_creer_un_compte_applique_la_regle_des_mots_de_passe_et_verifie_les_references(
    plateforme: Plateforme, admin: dict[str, str]
) -> None:
    base: dict[str, Any] = {"username": _unique("ref"), "email": f"{_unique('ref')}@example.org", "roleIds": []}
    court = plateforme.client.post("/users", headers=admin, json={**base, "motDePasse": "court"})
    assert court.status_code == 400 and court.json()["message"].startswith("Mot de passe non conforme : 10 caractères")
    egal = plateforme.client.post("/users", headers=admin, json={**base, "motDePasse": base["username"].upper()})
    assert egal.status_code == 400  # différent seulement par la casse : refusé
    conforme = plateforme.client.post("/users", headers=admin, json={**base, "motDePasse": base["username"] + "-mdp"})
    assert conforme.status_code == 201
    role_inconnu = plateforme.client.post(
        "/users",
        headers=admin,
        json={
            **base,
            "username": _unique("r2"),
            "email": "r2@example.org",
            "motDePasse": "assez-long-mdp",
            "roleIds": [987654321],
        },
    )
    assert (
        role_inconnu.status_code == 404 and role_inconnu.json()["message"] == "Rôle introuvable avec l'id : 987654321"
    )
    employe_inconnu = plateforme.client.post(
        "/users",
        headers=admin,
        json={
            **base,
            "username": _unique("r3"),
            "email": "r3@example.org",
            "motDePasse": "assez-long-mdp",
            "employeeId": 987654321,
        },
    )
    assert employe_inconnu.status_code == 400
    assert employe_inconnu.json()["message"] == "Employé introuvable avec l'id : 987654321"


def test_modifier_un_compte_controle_la_version_et_l_unicite_du_courriel(
    plateforme: Plateforme, admin: dict[str, str]
) -> None:
    compte, autre = _creer_compte(plateforme, admin), _creer_compte(plateforme, admin)
    corps = {
        "version": compte["version"],
        "email": f"nouveau-{compte['email']}",
        "actif": True,
        "employeeId": None,
        "roleIds": [],
    }
    ok = plateforme.client.put(f"/users/{compte['id']}", headers=admin, json=corps)
    assert ok.status_code == 200 and ok.json()["version"] == compte["version"] + 1
    perime = plateforme.client.put(f"/users/{compte['id']}", headers=admin, json=corps)
    assert perime.status_code == 409
    assert (
        perime.json()["message"]
        == "L'enregistrement a été modifié depuis son chargement. Rechargez-le avant de réessayer."
    )
    doublon = plateforme.client.put(
        f"/users/{compte['id']}",
        headers=admin,
        json={**corps, "version": ok.json()["version"], "email": autre["email"]},
    )
    assert doublon.status_code == 409
    inconnu = plateforme.client.put("/users/987654321", headers=admin, json=corps)
    assert inconnu.status_code == 404 and inconnu.json()["message"] == "Utilisateur introuvable avec l'id : 987654321"


def test_les_permissions_refusees_l_emportent_et_incrementent_la_version(
    plateforme: Plateforme, admin: dict[str, str]
) -> None:
    compte = _creer_compte(plateforme, admin, roleIds=[_id_role(plateforme, "SYSTEM_ADMIN")])
    refusee = _id_permission(plateforme, "USER_MANAGE")
    reponse = plateforme.client.put(
        f"/users/{compte['id']}/permissions-refusees",
        headers=admin,
        json={"version": compte["version"], "permissionIds": [refusee]},
    )
    assert reponse.status_code == 200
    corps = reponse.json()
    assert "USER_MANAGE" not in corps["permissionsEffectives"] and corps["version"] == compte["version"] + 1
    assert [p["code"] for p in corps["permissionsRefusees"]] == ["USER_MANAGE"]
    perime = plateforme.client.put(
        f"/users/{compte['id']}/permissions-refusees",
        headers=admin,
        json={"version": compte["version"], "permissionIds": []},
    )
    assert perime.status_code == 409
    inconnue = plateforme.client.put(
        f"/users/{compte['id']}/permissions-refusees",
        headers=admin,
        json={"version": corps["version"], "permissionIds": [987654321]},
    )
    assert inconnue.status_code == 400 and inconnue.json()["message"] == "Permission(s) inconnue(s) : 987654321"


def test_la_reinitialisation_par_un_administrateur_coupe_les_sessions(
    plateforme: Plateforme, admin: dict[str, str], connecter: Callable[[str, str], dict[str, Any]]
) -> None:
    compte = _creer_compte(plateforme, admin)
    connecter(compte["username"], "mot-de-passe-valide")
    reponse = plateforme.client.post(
        f"/users/{compte['id']}/reset-password", headers=admin, json={"nouveauMotDePasse": "autre-mdp-tres-long"}
    )
    assert reponse.status_code == 204
    with plateforme.moteur.connect() as c:
        actifs = c.execute(
            text("SELECT count(*) FROM refresh_token WHERE utilisateur_id = :i AND NOT revoque"), {"i": compte["id"]}
        ).scalar_one()
    assert actifs == 0
    evenement = next(
        e
        for e in plateforme.journal.de(None, Action.MOT_DE_PASSE_REINITIALISE_PAR_ADMIN)
        if e.details["cibleId"] == compte["id"]
    )
    assert evenement.details == {"cibleId": compte["id"], "cibleUsername": compte["username"], "sessionsRevoquees": 1}
    plateforme.client.cookies.clear()
    assert (
        plateforme.client.post(
            "/auth/login", json={"username": compte["username"], "password": "autre-mdp-tres-long"}
        ).status_code
        == 200
    )
    court = plateforme.client.post(
        f"/users/{compte['id']}/reset-password", headers=admin, json={"nouveauMotDePasse": "court"}
    )
    assert court.status_code == 400


# --- Rôles ----------------------------------------------------------------------------------------


def _creer_role(
    p: Plateforme, admin: dict[str, str], permissions: list[str] | None = None, **remplacements: Any
) -> dict[str, Any]:
    corps = {
        "nom": _unique("role"),
        "description": "rôle d'essai",
        "permissionIds": [_id_permission(p, c) for c in (permissions or [])],
        **remplacements,
    }
    reponse = p.client.post("/roles", headers=admin, json=corps)
    assert reponse.status_code == 201, reponse.text
    return reponse.json()


def test_le_role_d_administration_est_signale_protege_et_pas_les_autres(
    plateforme: Plateforme, admin: dict[str, str]
) -> None:
    protege = plateforme.client.get(f"/roles/{_id_role(plateforme, 'SYSTEM_ADMIN')}", headers=admin).json()
    assert protege["protege"] is True and len(protege["permissions"]) > 10
    assert [p["code"] for p in protege["permissions"]] == sorted(p["code"] for p in protege["permissions"])
    assert _creer_role(plateforme, admin)["protege"] is False


def test_renommer_ou_amputer_le_role_d_administration_est_refuse(plateforme: Plateforme, admin: dict[str, str]) -> None:
    role = plateforme.client.get(f"/roles/{_id_role(plateforme, 'SYSTEM_ADMIN')}", headers=admin).json()
    ids = [p["id"] for p in role["permissions"]]
    base = {"version": role["version"], "nom": "SYSTEM_ADMIN", "description": role["description"], "permissionIds": ids}
    renomme = plateforme.client.put(f"/roles/{role['id']}", headers=admin, json={**base, "nom": "AUTRE_NOM"})
    assert renomme.status_code == 409
    assert renomme.json()["message"] == "Le rôle « SYSTEM_ADMIN » est protégé : il ne peut pas être renommé."
    ampute = plateforme.client.put(f"/roles/{role['id']}", headers=admin, json={**base, "permissionIds": ids[1:]})
    assert ampute.status_code == 409 and ampute.json()["message"].endswith("privé de permissions.")
    supprime = plateforme.client.delete(f"/roles/{role['id']}", headers=admin)
    assert supprime.status_code == 409 and supprime.json()["message"].endswith("supprimé.")


def test_la_description_du_role_d_administration_reste_modifiable(
    plateforme: Plateforme, admin: dict[str, str]
) -> None:
    role = plateforme.client.get(f"/roles/{_id_role(plateforme, 'SYSTEM_ADMIN')}", headers=admin).json()
    ids = [p["id"] for p in role["permissions"]]
    corps = {
        "version": role["version"],
        "nom": "SYSTEM_ADMIN",
        "description": "Administration complète",
        "permissionIds": ids,
    }
    reponse = plateforme.client.put(f"/roles/{role['id']}", headers=admin, json=corps)
    assert reponse.status_code == 200 and reponse.json()["description"] == "Administration complète"
    with plateforme.moteur.begin() as c:  # le rôle d'amorçage est restauré pour les autres tests
        c.execute(text("UPDATE role SET description = :d WHERE nom = 'SYSTEM_ADMIN'"), {"d": role["description"]})


def test_un_autre_role_se_renomme_et_perd_ses_permissions_librement(
    plateforme: Plateforme, admin: dict[str, str]
) -> None:
    role = _creer_role(plateforme, admin, ["USER_MANAGE", "ROLE_MANAGE"])
    reponse = plateforme.client.put(
        f"/roles/{role['id']}",
        headers=admin,
        json={"version": role["version"], "nom": _unique("renomme"), "description": None, "permissionIds": []},
    )
    assert reponse.status_code == 200 and reponse.json()["permissions"] == [] and reponse.json()["description"] is None


def test_modifier_seulement_les_permissions_d_un_role_change_sa_version(
    plateforme: Plateforme, admin: dict[str, str]
) -> None:
    role = _creer_role(plateforme, admin, ["USER_MANAGE"])
    corps = {
        "version": role["version"],
        "nom": role["nom"],
        "description": role["description"],
        "permissionIds": [_id_permission(plateforme, "ROLE_MANAGE")],
    }
    premiere = plateforme.client.put(f"/roles/{role['id']}", headers=admin, json=corps)
    assert premiere.status_code == 200 and premiere.json()["version"] == role["version"] + 1
    assert (
        plateforme.client.put(f"/roles/{role['id']}", headers=admin, json=corps).status_code == 409
    )  # édition concurrente


def test_les_noms_de_roles_sont_uniques_sans_tenir_compte_de_la_casse(
    plateforme: Plateforme, admin: dict[str, str]
) -> None:
    role = _creer_role(plateforme, admin)
    doublon = plateforme.client.post("/roles", headers=admin, json={"nom": role["nom"].upper(), "permissionIds": []})
    assert doublon.status_code == 409 and doublon.json()["message"] == f"Ce rôle existe déjà : {role['nom'].upper()}"
    autre = _creer_role(plateforme, admin)
    conflit = plateforme.client.put(
        f"/roles/{autre['id']}",
        headers=admin,
        json={"version": autre["version"], "nom": role["nom"].upper(), "description": None, "permissionIds": []},
    )
    assert conflit.status_code == 409


def test_supprimer_un_role_attribue_est_refuse_puis_accepte_une_fois_retire(
    plateforme: Plateforme, admin: dict[str, str]
) -> None:
    role = _creer_role(plateforme, admin)
    compte = _creer_compte(plateforme, admin, roleIds=[role["id"]])
    refuse = plateforme.client.delete(f"/roles/{role['id']}", headers=admin)
    assert refuse.status_code == 409
    assert refuse.json()["message"] == (
        f"Le rôle « {role['nom']} » est attribué à 1 compte(s) : "
        "retirez-le d'abord de ces comptes avant de le supprimer."
    )
    retire = plateforme.client.put(
        f"/users/{compte['id']}",
        headers=admin,
        json={"version": compte["version"], "email": compte["email"], "actif": True, "roleIds": []},
    )
    assert retire.status_code == 200
    assert plateforme.client.delete(f"/roles/{role['id']}", headers=admin).status_code == 204
    assert plateforme.client.get(f"/roles/{role['id']}", headers=admin).status_code == 404
    inconnu = plateforme.client.delete(f"/roles/{role['id']}", headers=admin)
    assert inconnu.json()["message"] == f"Rôle introuvable avec l'id : {role['id']}"


def test_le_catalogue_des_permissions_est_trie_par_code(plateforme: Plateforme, admin: dict[str, str]) -> None:
    permissions = plateforme.client.get("/permissions", headers=admin).json()
    codes = [p["code"] for p in permissions]
    assert codes == sorted(codes) and {"USER_MANAGE", "ROLE_MANAGE", "IA_UTILISER"} <= set(codes)
    assert set(permissions[0]) == {"id", "version", "code", "description"}


# --- Validation des requêtes ----------------------------------------------------------------------


def _invalide(modele: type[Any], donnees: dict[str, Any]) -> set[str]:
    with pytest.raises(ValidationError) as erreur:
        modele.model_validate(donnees)
    return {str(e["loc"][0]) for e in erreur.value.errors()}


def test_la_creation_et_la_modification_de_compte_refusent_un_email_au_dela_de_la_colonne() -> None:
    long = "a" * 250 + "@x.org"
    creation = {"username": "alice", "email": long, "motDePasse": "assez-long-mdp", "roleIds": []}
    modification = {"version": 0, "email": long, "actif": True, "roleIds": []}
    assert _invalide(UtilisateurCreationRequete, creation) == {"email"}
    assert _invalide(UtilisateurModificationRequete, modification) == {"email"}


def test_le_nom_et_la_description_des_roles_respectent_les_memes_bornes_en_creation_et_modification() -> None:
    for modele, base in ((RoleCreationRequete, {}), (RoleModificationRequete, {"version": 0})):
        valide = {**base, "nom": "ab", "description": "d" * 255, "permissionIds": []}
        modele.model_validate(valide)
        assert _invalide(modele, {**valide, "nom": "a"}) == {"nom"}
        assert _invalide(modele, {**valide, "nom": "n" * 51}) == {"nom"}
        assert _invalide(modele, {**valide, "description": "d" * 256}) == {"description"}


def test_les_contrats_valides_acceptent_le_lien_employe_et_les_collections_vides() -> None:
    creation = UtilisateurCreationRequete.model_validate(
        {"username": "alice", "email": "alice@x.org", "motDePasse": "assez-long-mdp", "employeeId": 12, "roleIds": []}
    )
    assert creation.employee_id == 12 and creation.role_ids == set()
    modification = UtilisateurModificationRequete.model_validate(
        {"version": 3, "email": "alice@x.org", "actif": False, "employeeId": None, "roleIds": [1, 2]}
    )
    assert modification.employee_id is None and modification.role_ids == {1, 2}


def test_les_identifiants_de_droits_et_roles_sont_positifs_et_sans_null() -> None:
    base = {"nom": "role", "permissionIds": []}
    for invalide in ([0], [-1], [None]):
        assert _invalide(RoleCreationRequete, {**base, "permissionIds": invalide}) == {"permissionIds"}
    assert _invalide(
        UtilisateurCreationRequete,
        {"username": "alice", "email": "a@x.org", "motDePasse": "assez-long-mdp", "roleIds": [None]},
    ) == {"roleIds"}


def test_les_tailles_de_nom_portent_sur_la_valeur_sans_espaces_exterieurs() -> None:
    assert _invalide(RoleCreationRequete, {"nom": "  a  ", "permissionIds": []}) == {"nom"}
    assert RoleCreationRequete.model_validate({"nom": "  ab  ", "permissionIds": []}).nom == "ab"
    assert RoleCreationRequete.model_validate({"nom": " " + "n" * 50 + " ", "permissionIds": []}).nom == "n" * 50
    assert _invalide(
        UtilisateurCreationRequete,
        {"username": "  ab  ", "email": "a@x.org", "motDePasse": "assez-long-mdp", "roleIds": []},
    ) == {"username"}


def test_les_champs_obligatoires_manquants_donnent_un_message_francais(
    plateforme: Plateforme, admin: dict[str, str]
) -> None:
    reponse = plateforme.client.post("/roles", headers=admin, json={"description": "sans nom"})
    assert reponse.status_code == 400
    message = reponse.json()["message"]
    assert "nom : Ce champ est obligatoire." in message and "permissionIds : Ce champ est obligatoire." in message
    vide = plateforme.client.post("/auth/login", json={"username": "  ", "password": ""})
    assert vide.status_code == 400 and "username : Ce champ ne doit pas être vide." in vide.json()["message"]


# --- Recherche ------------------------------------------------------------------------------------


def test_les_comptes_sont_pagines_filtres_et_tries_par_le_serveur(
    plateforme: Plateforme, admin: dict[str, str]
) -> None:
    marque = _unique("rech")
    for i in range(5):
        _creer_compte(plateforme, admin, username=f"{marque}-{i}", email=f"{marque}-{i}@example.org")
    desactive = _creer_compte(plateforme, admin, username=f"{marque}-off", email=f"{marque}-off@example.org")
    plateforme.client.put(
        f"/users/{desactive['id']}",
        headers=admin,
        json={"version": desactive["version"], "email": desactive["email"], "actif": False, "roleIds": []},
    )
    page = plateforme.client.post(
        "/users/search?size=2&page=1&sort=username,desc", headers=admin, json={"username": marque.upper()}
    )
    corps = page.json()
    assert page.status_code == 200
    assert corps["page"] == {"size": 2, "number": 1, "totalElements": 6, "totalPages": 3}
    assert [u["username"] for u in corps["content"]] == [f"{marque}-3", f"{marque}-2"]
    actifs = plateforme.client.post(
        "/users/search?size=50", headers=admin, json={"username": marque, "actif": True}
    ).json()
    assert actifs["page"]["totalElements"] == 5
    par_email = plateforme.client.post(
        "/users/search?sort=email,asc", headers=admin, json={"email": f"{marque}-0@"}
    ).json()
    assert [u["username"] for u in par_email["content"]] == [f"{marque}-0"]
    sans_corps = plateforme.client.post("/users/search?size=1", headers=admin)
    assert sans_corps.status_code == 200 and sans_corps.json()["page"]["size"] == 1
    plafonne = plateforme.client.post("/users/search?size=100000", headers=admin).json()
    assert plafonne["page"]["size"] == 200


def test_un_joker_saisi_est_du_texte_pas_un_motif(plateforme: Plateforme, admin: dict[str, str]) -> None:
    marque = _unique("joker")
    _creer_compte(plateforme, admin, username=f"{marque}_a", email=f"{marque}a@example.org")
    _creer_compte(plateforme, admin, username=f"{marque}xa", email=f"{marque}xa@example.org")
    trouves = plateforme.client.post("/users/search", headers=admin, json={"username": f"{marque}_a"}).json()
    assert [u["username"] for u in trouves["content"]] == [f"{marque}_a"]
    pourcent = plateforme.client.post("/users/search", headers=admin, json={"username": "%"}).json()
    assert pourcent["page"]["totalElements"] == 0
    roles = plateforme.client.post("/roles/search", headers=admin, json={"nom": "%"}).json()
    assert roles["page"]["totalElements"] == 0


def test_les_roles_sont_pagines_filtres_et_tries_par_le_serveur(plateforme: Plateforme, admin: dict[str, str]) -> None:
    marque = _unique("rr")
    for i in range(3):
        _creer_role(plateforme, admin, nom=f"{marque}-{i}", description=f"famille {marque}")
    page = plateforme.client.post(
        "/roles/search?size=2&sort=nom,desc", headers=admin, json={"description": marque.upper()}
    ).json()
    assert page["page"] == {"size": 2, "number": 0, "totalElements": 3, "totalPages": 2}
    assert [r["nom"] for r in page["content"]] == [f"{marque}-2", f"{marque}-1"]
    assert all(set(r) == {"id", "version", "nom", "description", "permissions", "protege"} for r in page["content"])


# --- Courriel -------------------------------------------------------------------------------------


def test_le_lien_part_au_proprietaire_du_compte_avec_le_jeton() -> None:
    message = composer_lien_reinitialisation(
        "noreply@x.org", "alice@x.org", "http://localhost:5002", "JETON123", timedelta(hours=1)
    )
    assert message["To"] == "alice@x.org" and message["From"] == "noreply@x.org"
    assert message["Subject"] == "Staport RH — Réinitialisation de votre mot de passe"
    corps = message.get_content()
    assert "http://localhost:5002/reset-password#token=JETON123" in corps and "valable 1 heure" in corps


def test_la_duree_s_ecrit_comme_un_lecteur_la_dirait() -> None:
    assert libelle_duree(timedelta(minutes=1)) == "1 minute"
    assert libelle_duree(timedelta(minutes=45)) == "45 minutes"
    assert libelle_duree(timedelta(minutes=60)) == "1 heure"
    assert libelle_duree(timedelta(minutes=120)) == "2 heures"
    assert libelle_duree(timedelta(minutes=90)) == "90 minutes"


async def test_un_echec_d_envoi_n_est_jamais_renvoye_a_l_appelant(monkeypatch: pytest.MonkeyPatch) -> None:
    async def echec(*_args: object, **_kwargs: object) -> None:
        raise aiosmtplib.SMTPConnectError("serveur injoignable")

    monkeypatch.setattr(aiosmtplib, "send", echec)
    service = ServiceCourriel(construire_configuration("postgresql+psycopg://u:p@h:1/d", "x"))
    service.envoyer_lien_reinitialisation("alice@x.org", "JETON", timedelta(hours=1))
    await service.attendre_envois()  # aucune exception : l'échec est journalisé


async def test_l_envoi_est_asynchrone_et_borne(monkeypatch: pytest.MonkeyPatch) -> None:
    liberer = asyncio.Event()
    envoyes: list[str] = []

    async def lent(message: Any, **_kwargs: object) -> None:
        await liberer.wait()
        envoyes.append(message["To"])

    monkeypatch.setattr(aiosmtplib, "send", lent)
    service = ServiceCourriel(construire_configuration("postgresql+psycopg://u:p@h:1/d", "x"))
    service.envoyer_lien_reinitialisation("alice@x.org", "JETON", timedelta(hours=1))  # rend la main sans attendre
    assert envoyes == []
    for _ in range(103):  # 4 envois simultanés + 100 en attente, au total 104
        service.envoyer_lien_reinitialisation("bob@x.org", "JETON", timedelta(hours=1))
    with pytest.raises(FileSaturee):
        service.envoyer_lien_reinitialisation("trop@x.org", "JETON", timedelta(hours=1))
    liberer.set()
    await service.attendre_envois()
    assert len(envoyes) == 104

"""Décisions de contrat HTTP prises à la place des défauts de l'ancien backend (banc différentiel supprimé, KAN-238).

* les droits sont vérifiés avant la validation du corps : un compte sans droit reçoit 403, jamais 400 ;
* un téléversement au-delà de 20 Mo reçoit 413 avec un message (l'ancien backend coupait la connexion) ;
* un champ obligatoire absent à la modification d'un compte reçoit un message propre.
"""

from collections.abc import Callable
from typing import Any

from conftest import ADMIN, Plateforme
from sqlalchemy import text


def _entetes(connecter: Callable[[str, str], dict[str, Any]], compte: tuple[str, str]) -> dict[str, str]:
    return {"Authorization": f"Bearer {connecter(*compte)['accessToken']}"}


def test_les_droits_passent_avant_la_validation_du_corps(
    plateforme: Plateforme,
    connecter: Callable[[str, str], dict[str, Any]],
    creer_utilisateur: Callable[..., tuple[int, str]],
) -> None:
    identifiant, mot_de_passe = creer_utilisateur("sans-droit")  # aucun rôle : aucune permission
    entetes = _entetes(connecter, (_nom(plateforme, identifiant), mot_de_passe))

    corps_invalide = plateforme.client.post("/roles", headers=entetes, json={})
    assert corps_invalide.status_code == 403
    assert corps_invalide.json()["message"] == "Permission insuffisante pour effectuer cette action."


def _nom(plateforme: Plateforme, identifiant: int) -> str:
    with plateforme.moteur.connect() as c:
        return c.execute(text("SELECT username FROM utilisateur WHERE id = :i"), {"i": identifiant}).scalar_one()


def test_un_televersement_de_plus_de_20_mo_recoit_413_avec_un_message(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]]
) -> None:
    entetes = _entetes(connecter, ADMIN)
    gros = b"0" * (20 * 1024 * 1024 + 1)
    reponse = plateforme.client.post(
        "/paie/import/analyse", headers=entetes, data={"periode": "2997-01"}, files={"file": ("p.xlsx", gros)}
    )

    assert reponse.status_code == 413
    assert reponse.json()["message"] == "Fichier trop volumineux : 20 Mo maximum."


def test_modifier_un_compte_sans_le_champ_actif_donne_un_message_propre(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]]
) -> None:
    entetes = _entetes(connecter, ADMIN)
    reponse = plateforme.client.put(
        "/users/1", headers=entetes, json={"version": 1, "email": "l3@example.org", "roleIds": []}
    )

    assert reponse.status_code == 400
    assert reponse.json()["message"] == "actif : Ce champ est obligatoire."

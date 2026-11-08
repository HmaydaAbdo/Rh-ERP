"""Accueil personnalisé, de bout en bout sur PostgreSQL réel (parité avec `AccueilService` et `AccueilController`)."""

import uuid
from collections.abc import Callable
from typing import Any

from conftest import Plateforme
from sqlalchemy import text

TOUS = [
    "paie.masse",
    "paie.effectif",
    "paie.cout-moyen",
    "paie.stc",
    "employe.effectif",
    "employe.en-poste",
    "employe.age-moyen",
    "employe.anciennete-moyenne",
    "employe.embauches",
]
EMPLOYE = [code for code in TOUS if code.startswith("employe.")]


def _compte(
    creer_utilisateur: Callable[..., tuple[int, str]], connecter: Callable[[str, str], dict[str, Any]], *refusees: str
) -> tuple[int, dict[str, str]]:
    nom = f"accueil-{uuid.uuid4().hex[:8]}"
    identifiant, mot_de_passe = creer_utilisateur(roles=("SYSTEM_ADMIN",), refusees=refusees, username=nom)
    return identifiant, {"Authorization": f"Bearer {connecter(nom, mot_de_passe)['accessToken']}"}


def _journal(plateforme: Plateforme, action: str, resultat: str = "SUCCES") -> Any:
    with plateforme.moteur.connect() as c:
        return (
            c.execute(
                text(
                    "SELECT type_operation, entite_type, entite_id, resultat FROM audit_journal "
                    "WHERE action = :a AND resultat = :r ORDER BY id DESC LIMIT 1"
                ),
                {"a": action, "r": resultat},
            )
            .mappings()
            .one()
        )


def _revisions(plateforme: Plateforme, utilisateur: int) -> list[int]:
    with plateforme.moteur.connect() as c:
        return [
            ligne[0]
            for ligne in c.execute(
                text("SELECT a.revtype FROM accueil_preference_aud a WHERE a.utilisateur_id = :u ORDER BY a.rev"),
                {"u": utilisateur},
            )
        ]


def test_sans_choix_l_accueil_montre_tout_ce_qui_est_autorise(
    plateforme: Plateforme,
    connecter: Callable[[str, str], dict[str, Any]],
    creer_utilisateur: Callable[..., tuple[int, str]],
) -> None:
    _, entetes = _compte(creer_utilisateur, connecter)

    reponse = plateforme.client.get("/accueil", headers=entetes)

    assert reponse.status_code == 200, reponse.text
    corps = reponse.json()
    assert (corps["version"], corps["personnalise"], corps["indicateurs"]) == (None, False, TOUS)
    assert [d["code"] for d in corps["disponibles"]] == TOUS
    assert set(corps["disponibles"][0]) == {"code", "libelle", "description"}


def test_les_permissions_de_lecture_limitent_les_indicateurs(
    plateforme: Plateforme,
    connecter: Callable[[str, str], dict[str, Any]],
    creer_utilisateur: Callable[..., tuple[int, str]],
) -> None:
    _, entetes = _compte(creer_utilisateur, connecter, "PAIE_READ")

    corps = plateforme.client.get("/accueil", headers=entetes).json()

    assert corps["indicateurs"] == EMPLOYE
    assert [d["code"] for d in corps["disponibles"]] == EMPLOYE


def test_enregistrer_garde_l_ordre_et_verrouille_la_version(
    plateforme: Plateforme,
    connecter: Callable[[str, str], dict[str, Any]],
    creer_utilisateur: Callable[..., tuple[int, str]],
) -> None:
    utilisateur, entetes = _compte(creer_utilisateur, connecter)
    choix = ["employe.effectif", "paie.masse"]

    premier = plateforme.client.put("/accueil", headers=entetes, json={"indicateurs": choix})
    v0 = premier.json()["version"]
    relu = plateforme.client.get("/accueil", headers=entetes).json()
    second = plateforme.client.put("/accueil", headers=entetes, json={"version": v0, "indicateurs": ["paie.stc"]})
    perime = plateforme.client.put("/accueil", headers=entetes, json={"version": v0, "indicateurs": choix})

    assert premier.status_code == 200, premier.text
    assert (premier.json()["personnalise"], premier.json()["indicateurs"]) == (True, choix)
    assert isinstance(v0, int), "la version, opaque pour le client, est fournie dès le premier enregistrement"
    assert relu["indicateurs"] == choix
    assert (second.status_code, second.json()["version"], second.json()["indicateurs"]) == (200, v0 + 1, ["paie.stc"])
    assert perime.status_code == 409
    assert _revisions(plateforme, utilisateur) == [0, 1]
    journal = _journal(plateforme, "ACCUEIL_MODIFICATION")
    assert (journal["type_operation"], journal["entite_type"]) == ("UPDATE", "PreferenceAccueil")
    assert _journal(plateforme, "ACCUEIL_MODIFICATION", "ECHEC")["entite_type"] == "PreferenceAccueil", (
        "le 409 est audité"
    )


def test_un_premier_enregistrement_ne_peut_pas_annoncer_de_version(
    plateforme: Plateforme,
    connecter: Callable[[str, str], dict[str, Any]],
    creer_utilisateur: Callable[..., tuple[int, str]],
) -> None:
    _, entetes = _compte(creer_utilisateur, connecter)

    reponse = plateforme.client.put("/accueil", headers=entetes, json={"version": 3, "indicateurs": ["paie.stc"]})

    assert reponse.status_code == 409


def test_indicateurs_invalides_refuses_sans_rien_ecrire(
    plateforme: Plateforme,
    connecter: Callable[[str, str], dict[str, Any]],
    creer_utilisateur: Callable[..., tuple[int, str]],
) -> None:
    utilisateur, entetes = _compte(creer_utilisateur, connecter, "PAIE_READ")

    inconnu = plateforme.client.put("/accueil", headers=entetes, json={"indicateurs": ["nimporte.quoi"]})
    interdit = plateforme.client.put("/accueil", headers=entetes, json={"indicateurs": ["paie.masse"]})
    double = plateforme.client.put("/accueil", headers=entetes, json={"indicateurs": ["employe.effectif"] * 2})
    trop = plateforme.client.put("/accueil", headers=entetes, json={"indicateurs": ["employe.effectif"] * 21})

    assert [r.status_code for r in (inconnu, interdit, double, trop)] == [400, 400, 400, 400]
    assert inconnu.json()["message"] == "Indicateur inconnu : nimporte.quoi"
    assert interdit.json()["message"] == "Indicateur non autorisé pour cet utilisateur : paie.masse"
    assert double.json()["message"] == "Indicateur en double : employe.effectif"
    assert _revisions(plateforme, utilisateur) == []


def test_un_choix_vide_volontaire_reste_vide(
    plateforme: Plateforme,
    connecter: Callable[[str, str], dict[str, Any]],
    creer_utilisateur: Callable[..., tuple[int, str]],
) -> None:
    _, entetes = _compte(creer_utilisateur, connecter)

    reponse = plateforme.client.put("/accueil", headers=entetes, json={"indicateurs": []})

    assert reponse.status_code == 200, reponse.text
    assert (reponse.json()["personnalise"], reponse.json()["indicateurs"]) == (True, [])


def test_un_droit_retire_depuis_le_choix_retombe_sur_tout_l_autorise(
    plateforme: Plateforme,
    connecter: Callable[[str, str], dict[str, Any]],
    creer_utilisateur: Callable[..., tuple[int, str]],
) -> None:
    utilisateur, entetes = _compte(creer_utilisateur, connecter)
    plateforme.client.put("/accueil", headers=entetes, json={"indicateurs": ["paie.masse"]})
    with plateforme.moteur.begin() as c:
        c.execute(
            text(
                "INSERT INTO utilisateur_permission_refusee (utilisateur_id, permission_id) "
                "SELECT :u, id FROM permission WHERE code = 'PAIE_READ'"
            ),
            {"u": utilisateur},
        )

    corps = plateforme.client.get("/accueil", headers=entetes).json()

    assert corps["personnalise"] is True
    assert corps["indicateurs"] == EMPLOYE


def test_reinitialiser_rend_tout_l_autorise_et_est_audite(
    plateforme: Plateforme,
    connecter: Callable[[str, str], dict[str, Any]],
    creer_utilisateur: Callable[..., tuple[int, str]],
) -> None:
    utilisateur, entetes = _compte(creer_utilisateur, connecter)
    plateforme.client.put("/accueil", headers=entetes, json={"indicateurs": ["paie.stc"]})

    reponse = plateforme.client.delete("/accueil", headers=entetes)
    encore = plateforme.client.delete("/accueil", headers=entetes)

    assert reponse.status_code == 200, reponse.text
    assert (reponse.json()["version"], reponse.json()["personnalise"], reponse.json()["indicateurs"]) == (
        None,
        False,
        TOUS,
    )
    assert encore.status_code == 200
    assert _revisions(plateforme, utilisateur) == [0, 2]
    journal = _journal(plateforme, "ACCUEIL_REINITIALISATION")
    assert (journal["type_operation"], journal["entite_type"]) == ("DELETE", "PreferenceAccueil")


def test_un_administrateur_regle_l_accueil_d_un_autre_utilisateur(
    plateforme: Plateforme,
    connecter: Callable[[str, str], dict[str, Any]],
    creer_utilisateur: Callable[..., tuple[int, str]],
) -> None:
    cible, entetes_cible = _compte(creer_utilisateur, connecter, "PAIE_READ")
    _, entetes_admin = _compte(creer_utilisateur, connecter)
    chemin = f"/accueil/utilisateurs/{cible}"

    avant = plateforme.client.get(chemin, headers=entetes_admin).json()
    refuse = plateforme.client.put(chemin, headers=entetes_admin, json={"indicateurs": ["paie.masse"]})
    regle = plateforme.client.put(chemin, headers=entetes_admin, json={"indicateurs": ["employe.age-moyen"]})
    vu_par_la_cible = plateforme.client.get("/accueil", headers=entetes_cible).json()
    reinitialise = plateforme.client.delete(chemin, headers=entetes_admin)

    assert avant["indicateurs"] == EMPLOYE, "les droits de la cible, pas ceux de l'administrateur"
    assert refuse.status_code == 400
    assert refuse.json()["message"] == "Indicateur non autorisé pour cet utilisateur : paie.masse"
    assert regle.status_code == 200, regle.text
    assert vu_par_la_cible["indicateurs"] == ["employe.age-moyen"]
    assert (reinitialise.status_code, reinitialise.json()["personnalise"]) == (200, False)


def test_utilisateur_inconnu_et_permission_d_administration(
    plateforme: Plateforme,
    connecter: Callable[[str, str], dict[str, Any]],
    creer_utilisateur: Callable[..., tuple[int, str]],
) -> None:
    _, entetes_admin = _compte(creer_utilisateur, connecter)
    _, entetes_simple = _compte(creer_utilisateur, connecter, "ACCUEIL_ADMIN")

    inconnu = plateforme.client.get("/accueil/utilisateurs/999999999", headers=entetes_admin)
    interdit = plateforme.client.get("/accueil/utilisateurs/1", headers=entetes_simple)
    le_sien = plateforme.client.get("/accueil", headers=entetes_simple)

    assert inconnu.status_code == 404
    assert inconnu.json()["message"] == "Utilisateur introuvable avec l'id : 999999999"
    assert interdit.status_code == 403
    assert le_sien.status_code == 200


def test_chaque_route_exige_sa_permission(
    plateforme: Plateforme,
    connecter: Callable[[str, str], dict[str, Any]],
    creer_utilisateur: Callable[..., tuple[int, str]],
) -> None:
    _, sans_lecture = _compte(creer_utilisateur, connecter, "ACCUEIL_READ")
    _, sans_ecriture = _compte(creer_utilisateur, connecter, "ACCUEIL_WRITE")

    lecture = plateforme.client.get("/accueil", headers=sans_lecture)
    ecriture = plateforme.client.put("/accueil", headers=sans_ecriture, json={"indicateurs": []})
    reinit = plateforme.client.delete("/accueil", headers=sans_ecriture)
    anonyme = plateforme.client.get("/accueil")

    assert (lecture.status_code, ecriture.status_code, reinit.status_code, anonyme.status_code) == (403, 403, 403, 401)

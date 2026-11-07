"""Suppression et restauration de groupes de bulletins (parité `deleteGroupe` / `restaurerGroupeDepuisAudit`).

PostgreSQL réel : la suppression passe par l'API, donc par la session auditée, les révisions `paie_aud` et le journal.
"""

import uuid
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from typing import Any

import pytest
from conftest import ADMIN, Plateforme
from sqlalchemy import text

PERIODE = 209805


@dataclass
class Jeu:
    fonction: int
    chantier: int
    employes: list[int]
    bulletins: list[int]


@pytest.fixture
def jeu(plateforme: Plateforme) -> Iterator[Jeu]:
    marque = uuid.uuid4().hex[:8]
    with plateforme.moteur.begin() as c:
        fonction = c.execute(
            text("INSERT INTO fonction (libelle) VALUES (:l) RETURNING id"), {"l": f"GRP {marque}"}
        ).scalar_one()
        chantier = c.execute(
            text("INSERT INTO chantier (code, designation) VALUES (:c, 'Groupe') RETURNING id"), {"c": f"G{marque}"}
        ).scalar_one()
        employes: list[int] = []
        bulletins: list[int] = []
        for rang in range(3):
            employe = c.execute(
                text(
                    "INSERT INTO employe (nom_prenom, cin, date_naissance, date_embauche, fonction_id, "
                    "chantier_id, statut) "
                    "VALUES (:n, :cin, '1990-01-01', '2020-01-01', :f, :c, 'ACTIF') RETURNING id"
                ),
                {"n": f"Groupe {rang}", "cin": f"G{marque}{rang}", "f": fonction, "c": chantier},
            ).scalar_one()
            employes.append(employe)
            bulletins.append(
                c.execute(
                    text(
                        "INSERT INTO paie (employee_id, periode, fonction_id, chantier_id, nombre_jours_travailles, "
                        "salaire_mensuel, salaire_total) VALUES (:e, :p, :f, :c, 26, 100, 100) RETURNING id"
                    ),
                    {"e": employe, "p": PERIODE, "f": fonction, "c": chantier},
                ).scalar_one()
            )
    yield Jeu(fonction, chantier, employes, bulletins)
    with plateforme.moteur.begin() as c:
        c.execute(text("DELETE FROM paie WHERE chantier_id = :c"), {"c": chantier})
        c.execute(text("DELETE FROM employe WHERE chantier_id = :c"), {"c": chantier})
        c.execute(text("DELETE FROM chantier WHERE id = :c"), {"c": chantier})
        c.execute(text("DELETE FROM fonction WHERE id = :f"), {"f": fonction})


def _entetes(connecter: Callable[[str, str], dict[str, Any]], identifiants: tuple[str, str] = ADMIN) -> dict[str, str]:
    return {"Authorization": f"Bearer {connecter(*identifiants)['accessToken']}"}


def _compte(plateforme: Plateforme, chantier: int) -> int:
    with plateforme.moteur.connect() as c:
        return c.execute(text("SELECT count(*) FROM paie WHERE chantier_id = :c"), {"c": chantier}).scalar_one()


def _supprimer(plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu, attendu: int, **criteres: Any) -> Any:
    corps = {"criteres": {"periode": "2098-05", "chantierIds": [jeu.chantier], **criteres}, "nombreAttendu": attendu}
    return plateforme.client.post("/paie/suppression", headers=entetes, json=corps)


def test_suppression_de_groupe_supprime_et_audite_le_perimetre(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], jeu: Jeu
) -> None:
    reponse = _supprimer(plateforme, _entetes(connecter), jeu, 3)

    assert reponse.status_code == 200, reponse.text
    assert reponse.json() == {"supprimes": 3}
    assert _compte(plateforme, jeu.chantier) == 0
    with plateforme.moteur.connect() as c:
        entree = (
            c.execute(
                text(
                    "SELECT nombre_elements, perimetre, revision_id, resultat, type_operation FROM audit_journal "
                    "WHERE action = 'PAIE_SUPPRESSION_GROUPE' ORDER BY id DESC LIMIT 1"
                )
            )
            .mappings()
            .one()
        )
        revisions = c.execute(
            text("SELECT count(*) FROM paie_aud WHERE rev = :r AND revtype = 2"), {"r": entree["revision_id"]}
        ).scalar_one()
    assert entree["resultat"] == "SUCCES"
    assert entree["type_operation"] == "DELETE"
    assert entree["nombre_elements"] == 3
    assert entree["perimetre"]["periode"] == "2098-05"
    assert entree["perimetre"]["chantierIds"] == [jeu.chantier]
    assert entree["perimetre"]["nombreConfirme"] == 3
    assert revisions == 3, "chaque bulletin supprimé doit avoir son instantané de suppression"


def test_suppression_de_groupe_refuse_tout_si_le_nombre_a_change(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], jeu: Jeu
) -> None:
    reponse = _supprimer(plateforme, _entetes(connecter), jeu, 2)

    assert reponse.status_code == 409
    assert reponse.json()["message"] == (
        "Le groupe a changé depuis son affichage : 3 bulletin(s) correspondent maintenant, 2 étaient attendus. "
        "Rien n'a été supprimé, actualisez la page."
    )
    assert _compte(plateforme, jeu.chantier) == 3


def test_suppression_de_groupe_exige_le_mois(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], jeu: Jeu
) -> None:
    reponse = plateforme.client.post(
        "/paie/suppression",
        headers=_entetes(connecter),
        json={"criteres": {"chantierIds": [jeu.chantier]}, "nombreAttendu": 3},
    )

    assert reponse.status_code == 400
    assert "période est obligatoire" in reponse.json()["message"]
    assert _compte(plateforme, jeu.chantier) == 3


def test_suppression_de_groupe_exige_paie_purge(
    plateforme: Plateforme,
    connecter: Callable[[str, str], dict[str, Any]],
    creer_utilisateur: Callable[..., tuple[int, str]],
    jeu: Jeu,
) -> None:
    nom = f"sans-purge-{uuid.uuid4().hex[:8]}"
    _, mot_de_passe = creer_utilisateur(roles=("SYSTEM_ADMIN",), refusees=("PAIE_PURGE",), username=nom)

    reponse = _supprimer(plateforme, _entetes(connecter, (nom, mot_de_passe)), jeu, 3)

    assert reponse.status_code == 403
    assert _compte(plateforme, jeu.chantier) == 3

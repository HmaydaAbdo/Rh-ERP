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
        c.execute(text("DELETE FROM paie WHERE employee_id = ANY(:e)"), {"e": employes})
        c.execute(text("DELETE FROM employe WHERE id = ANY(:e)"), {"e": employes})
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


def _entree_suppression(plateforme: Plateforme) -> int:
    with plateforme.moteur.connect() as c:
        return c.execute(
            text("SELECT id FROM audit_journal WHERE action = 'PAIE_SUPPRESSION_GROUPE' ORDER BY id DESC LIMIT 1")
        ).scalar_one()


def _supprimer_puis_entree(plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu) -> int:
    assert _supprimer(plateforme, entetes, jeu, 3).status_code == 200
    return _entree_suppression(plateforme)


def test_restauration_recree_le_groupe_depuis_l_audit(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], jeu: Jeu
) -> None:
    entetes = _entetes(connecter)
    entree = _supprimer_puis_entree(plateforme, entetes, jeu)

    reponse = plateforme.client.post(f"/paie/restauration/{entree}", headers=entetes)

    assert reponse.status_code == 201, reponse.text
    assert reponse.json() == {"restaures": 3}
    with plateforme.moteur.connect() as c:
        lignes = c.execute(
            text(
                "SELECT employee_id, periode, salaire_total, id FROM paie WHERE chantier_id = :c ORDER BY employee_id"
            ),
            {"c": jeu.chantier},
        ).all()
        journal = (
            c.execute(
                text(
                    "SELECT nombre_elements, perimetre, type_operation FROM audit_journal "
                    "WHERE action = 'PAIE_RESTAURATION_GROUPE' ORDER BY id DESC LIMIT 1"
                )
            )
            .mappings()
            .one()
        )
    assert [(x[0], x[1], str(x[2])) for x in lignes] == [(e, PERIODE, "100.00") for e in sorted(jeu.employes)]
    assert set(jeu.bulletins).isdisjoint({x[3] for x in lignes}), "les bulletins reçoivent de nouveaux identifiants"
    assert journal["nombre_elements"] == 3
    assert journal["type_operation"] == "CREATE"
    assert journal["perimetre"] == {"entreeAuditSourceId": entree}


def test_restauration_refuse_tout_si_un_bulletin_existe_deja(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], jeu: Jeu
) -> None:
    entetes = _entetes(connecter)
    entree = _supprimer_puis_entree(plateforme, entetes, jeu)
    assert plateforme.client.post(f"/paie/restauration/{entree}", headers=entetes).status_code == 201

    reponse = plateforme.client.post(f"/paie/restauration/{entree}", headers=entetes)

    assert reponse.status_code == 409
    assert reponse.json()["message"] == (
        "Restauration refusée : 3 conflit(s) employé/mois ou référence manquante. Aucun bulletin n'a été restauré."
    )
    assert _compte(plateforme, jeu.chantier) == 3


def test_restauration_refuse_tout_si_une_reference_a_disparu(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], jeu: Jeu
) -> None:
    entetes = _entetes(connecter)
    entree = _supprimer_puis_entree(plateforme, entetes, jeu)
    with plateforme.moteur.begin() as c:
        c.execute(text("DELETE FROM employe WHERE id = :e"), {"e": jeu.employes[0]})

    reponse = plateforme.client.post(f"/paie/restauration/{entree}", headers=entetes)

    assert reponse.status_code == 409
    assert "1 conflit(s)" in reponse.json()["message"]
    assert _compte(plateforme, jeu.chantier) == 0, "atomique : aucun des trois bulletins n'est restauré"


def test_restauration_refuse_une_entree_qui_n_est_pas_une_suppression_de_groupe(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], jeu: Jeu
) -> None:
    entetes = _entetes(connecter)
    with plateforme.moteur.connect() as c:
        autre = c.execute(
            text("SELECT id FROM audit_journal WHERE action <> 'PAIE_SUPPRESSION_GROUPE' LIMIT 1")
        ).scalar_one()

    reponse = plateforme.client.post(f"/paie/restauration/{autre}", headers=entetes)

    assert reponse.status_code == 409
    assert reponse.json()["message"] == (
        f"L'entrée d'audit {autre} ne correspond pas à une suppression de groupe restaurable."
    )
    assert _compte(plateforme, jeu.chantier) == 3


def test_restauration_d_une_entree_inconnue_est_introuvable(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]]
) -> None:
    reponse = plateforme.client.post("/paie/restauration/999999999", headers=_entetes(connecter))

    assert reponse.status_code == 404


def test_restauration_exige_paie_restore(
    plateforme: Plateforme,
    connecter: Callable[[str, str], dict[str, Any]],
    creer_utilisateur: Callable[..., tuple[int, str]],
    jeu: Jeu,
) -> None:
    nom = f"sans-restore-{uuid.uuid4().hex[:8]}"
    _, mot_de_passe = creer_utilisateur(roles=("SYSTEM_ADMIN",), refusees=("PAIE_RESTORE",), username=nom)
    entree = _supprimer_puis_entree(plateforme, _entetes(connecter), jeu)

    reponse = plateforme.client.post(f"/paie/restauration/{entree}", headers=_entetes(connecter, (nom, mot_de_passe)))

    assert reponse.status_code == 403
    assert _compte(plateforme, jeu.chantier) == 0


def _corps_bulletin(jeu: Jeu, employe: int, periode: str, **remplacements: Any) -> dict[str, Any]:
    corps: dict[str, Any] = {
        "employeeId": employe,
        "periode": periode,
        "fonctionId": jeu.fonction,
        "chantierId": jeu.chantier,
        "equipeId": None,
        "nombreJoursTravailles": "26",
        "salaireMensuel": "100.00",
        "salaireTotal": "100.00",
    }
    return corps | remplacements


def _equipe_employe(plateforme: Plateforme, employe: int) -> int | None:
    with plateforme.moteur.connect() as c:
        return c.execute(text("SELECT equipe_id FROM employe WHERE id = :e"), {"e": employe}).scalar_one()


@pytest.fixture
def equipe(plateforme: Plateforme, jeu: Jeu) -> Iterator[int]:
    with plateforme.moteur.begin() as c:
        identifiant = c.execute(
            text("INSERT INTO equipe (code, libelle) VALUES (:c, 'Equipe groupe') RETURNING id"),
            {"c": f"E{uuid.uuid4().hex[:8]}"},
        ).scalar_one()
    yield identifiant
    with plateforme.moteur.begin() as c:
        c.execute(text("UPDATE employe SET equipe_id = NULL WHERE id = ANY(:e)"), {"e": jeu.employes})
        c.execute(text("DELETE FROM paie WHERE equipe_id = :i"), {"i": identifiant})
        c.execute(text("DELETE FROM equipe WHERE id = :i"), {"i": identifiant})


def test_creation_rejette_les_references_inexistantes_avec_les_messages_de_spring(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], jeu: Jeu
) -> None:
    entetes = _entetes(connecter)
    cas = [
        (_corps_bulletin(jeu, 999999999, "2098-06"), "Employé introuvable avec l'id : 999999999"),
        (
            _corps_bulletin(jeu, jeu.employes[0], "2098-06", fonctionId=999999999),
            "Fonction introuvable avec l'id : 999999999",
        ),
        (
            _corps_bulletin(jeu, jeu.employes[0], "2098-06", chantierId=999999999),
            "Chantier introuvable avec l'id : 999999999",
        ),
        (
            _corps_bulletin(jeu, jeu.employes[0], "2098-06", equipeId=999999999),
            "Équipe introuvable avec l'id : 999999999",
        ),
    ]
    for corps, message in cas:
        reponse = plateforme.client.post("/paie", headers=entetes, json=corps)
        assert reponse.status_code == 400, reponse.text
        assert reponse.json()["message"] == message


def test_le_bulletin_cree_l_equipe_de_l_employe_actif_et_epargne_l_inactif(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], jeu: Jeu, equipe: int
) -> None:
    entetes = _entetes(connecter)
    with plateforme.moteur.begin() as c:
        c.execute(
            text("UPDATE employe SET statut = 'INACTIF', chantier_id = NULL WHERE id = :e"), {"e": jeu.employes[1]}
        )

    actif = plateforme.client.post(
        "/paie", headers=entetes, json=_corps_bulletin(jeu, jeu.employes[0], "2098-06", equipeId=equipe)
    )
    inactif = plateforme.client.post(
        "/paie", headers=entetes, json=_corps_bulletin(jeu, jeu.employes[1], "2098-06", equipeId=equipe)
    )

    assert actif.status_code == 201, actif.text
    assert inactif.status_code == 201, inactif.text
    assert _equipe_employe(plateforme, jeu.employes[0]) == equipe
    assert _equipe_employe(plateforme, jeu.employes[1]) is None


def test_la_modification_met_a_jour_l_equipe_de_l_employe(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], jeu: Jeu, equipe: int
) -> None:
    entetes = _entetes(connecter)
    corps = _corps_bulletin(jeu, jeu.employes[0], "2098-05", equipeId=equipe) | {"version": 0}

    reponse = plateforme.client.put(f"/paie/{jeu.bulletins[0]}", headers=entetes, json=corps)

    assert reponse.status_code == 200, reponse.text
    assert reponse.json()["equipe"]["id"] == equipe
    assert _equipe_employe(plateforme, jeu.employes[0]) == equipe

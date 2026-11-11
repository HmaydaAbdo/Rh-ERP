"""La fiche employé reprend l'état de son dernier bulletin à chaque écriture manuelle de bulletin (ADR 0010).

Parcours de bout en bout sur PostgreSQL réel : création, modification, suppression, STC / sortie et retour.
"""

import uuid
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from typing import Any

import pytest
from conftest import ADMIN, Plateforme
from sqlalchemy import text


@dataclass
class Jeu:
    employe: int
    fonctions: tuple[int, int]
    chantiers: tuple[int, int]
    equipes: tuple[int, int]


def _inserer(plateforme: Plateforme, requete: str, **valeurs: Any) -> int:
    with plateforme.moteur.begin() as c:
        return c.execute(text(requete), valeurs).scalar_one()


@pytest.fixture
def jeu(plateforme: Plateforme) -> Iterator[Jeu]:
    marque = uuid.uuid4().hex[:6].upper()
    fonctions = tuple(
        _inserer(plateforme, "INSERT INTO fonction (libelle) VALUES (:l) RETURNING id", l=f"FI{marque}{i}")
        for i in range(2)
    )
    chantiers = tuple(
        _inserer(
            plateforme, "INSERT INTO chantier (code, designation) VALUES (:c, 'Fiche') RETURNING id", c=f"FI{marque}{i}"
        )
        for i in range(2)
    )
    equipes = tuple(
        _inserer(
            plateforme,
            "INSERT INTO equipe (code, libelle) VALUES (:c, :l) RETURNING id",
            c=f"E{marque}{i}",
            l=f"Eq {marque}{i}",
        )
        for i in range(2)
    )
    employe = _inserer(
        plateforme,
        "INSERT INTO employe (nom_prenom, cin, date_naissance, date_embauche, fonction_id, chantier_id, statut, "
        "salaire, type_salaire) VALUES ('Fiche Test', :cin, '1990-01-01', '2020-01-01', :f, :c, 'ACTIF', 1000, "
        "'MENSUEL') RETURNING id",
        cin=f"FI{marque}",
        f=fonctions[0],
        c=chantiers[0],
    )
    donnees = Jeu(employe, (fonctions[0], fonctions[1]), (chantiers[0], chantiers[1]), (equipes[0], equipes[1]))
    yield donnees
    with plateforme.moteur.begin() as c:
        c.execute(text("DELETE FROM paie WHERE employee_id = :e"), {"e": employe})
        c.execute(text("DELETE FROM employe_sortie WHERE employee_id = :e"), {"e": employe})
        c.execute(text("DELETE FROM employe WHERE id = :e"), {"e": employe})
        c.execute(text("DELETE FROM chantier WHERE id = ANY(:c)"), {"c": list(chantiers)})
        c.execute(text("DELETE FROM equipe WHERE id = ANY(:e)"), {"e": list(equipes)})
        c.execute(text("DELETE FROM fonction WHERE id = ANY(:f)"), {"f": list(fonctions)})


def _entetes(connecter: Callable[[str, str], dict[str, Any]]) -> dict[str, str]:
    return {"Authorization": f"Bearer {connecter(*ADMIN)['accessToken']}"}


def _corps(
    jeu: Jeu, rang: int, *, chantier: int = 0, equipe: int | None = None, observation: str | None = None
) -> dict[str, Any]:
    return {
        "fonctionId": jeu.fonctions[chantier],
        "chantierId": jeu.chantiers[chantier],
        "equipeId": None if equipe is None else jeu.equipes[equipe],
        "nombreJoursTravailles": 26,
        "salaireMensuel": 3000 + chantier,
        "salaireTotal": 3000 + chantier,
        "observation": observation,
        **({"employeeId": jeu.employe, "periode": f"2088-{rang:02d}"} if rang else {}),
    }


def _creer(plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu, rang: int, **options: Any) -> dict[str, Any]:
    reponse = plateforme.client.post("/paie", headers=entetes, json=_corps(jeu, rang, **options))
    assert reponse.status_code in (200, 201), reponse.text
    return reponse.json()


def _fiche(plateforme: Plateforme, jeu: Jeu) -> dict[str, Any]:
    with plateforme.moteur.begin() as c:
        ligne = c.execute(
            text("SELECT statut, fonction_id, chantier_id, equipe_id, salaire FROM employe WHERE id = :e"),
            {"e": jeu.employe},
        ).one()
    return {
        "statut": ligne.statut,
        "fonction": ligne.fonction_id,
        "chantier": ligne.chantier_id,
        "equipe": ligne.equipe_id,
        "salaire": ligne.salaire,
    }


def _departs(plateforme: Plateforme, jeu: Jeu) -> list[tuple[int, str]]:
    with plateforme.moteur.begin() as c:
        lignes = c.execute(
            text("SELECT periode, motif FROM employe_sortie WHERE employee_id = :e ORDER BY periode"),
            {"e": jeu.employe},
        ).all()
    return [(ligne.periode, ligne.motif) for ligne in lignes]


def test_la_fiche_suit_le_dernier_bulletin_jamais_un_mois_plus_ancien(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], jeu: Jeu
) -> None:
    entetes = _entetes(connecter)
    _creer(plateforme, entetes, jeu, 1, chantier=0, equipe=0)
    assert _fiche(plateforme, jeu)["chantier"] == jeu.chantiers[0]
    assert _fiche(plateforme, jeu)["equipe"] == jeu.equipes[0]

    _creer(plateforme, entetes, jeu, 3, chantier=1)
    assert _fiche(plateforme, jeu) == {
        "statut": "ACTIF",
        "fonction": jeu.fonctions[1],
        "chantier": jeu.chantiers[1],
        "equipe": None,
        "salaire": 1000,
    }

    _creer(plateforme, entetes, jeu, 2, chantier=0, equipe=1)  # mois plus ancien que le dernier : fiche inchangée
    assert _fiche(plateforme, jeu)["chantier"] == jeu.chantiers[1]
    assert _fiche(plateforme, jeu)["equipe"] is None


def test_stc_enregistre_le_depart_puis_modification_et_suppression_le_defont(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], jeu: Jeu
) -> None:
    entetes = _entetes(connecter)
    _creer(plateforme, entetes, jeu, 1)
    bulletin = _creer(plateforme, entetes, jeu, 2, observation=" stc ")
    assert _fiche(plateforme, jeu)["statut"] == "INACTIF"
    assert _fiche(plateforme, jeu)["chantier"] is None and _fiche(plateforme, jeu)["equipe"] is None
    assert _departs(plateforme, jeu) == [(208802, "STC")]

    corps = {**_corps(jeu, 0), "version": bulletin["version"], "observation": "Sortie"}
    assert plateforme.client.put(f"/paie/{bulletin['id']}", headers=entetes, json=corps).status_code == 200
    assert _departs(plateforme, jeu) == [(208802, "Sortie")]
    assert _fiche(plateforme, jeu)["statut"] == "INACTIF"

    bulletin = plateforme.client.get(f"/paie/{bulletin['id']}", headers=entetes).json()
    corps = {**_corps(jeu, 0), "version": bulletin["version"], "observation": None}
    assert plateforme.client.put(f"/paie/{bulletin['id']}", headers=entetes, json=corps).status_code == 200
    assert _departs(plateforme, jeu) == []
    # Départ défait : l'employé revient en poste, avec le salaire du bulletin comme à l'import.
    assert _fiche(plateforme, jeu)["statut"] == "ACTIF"
    assert _fiche(plateforme, jeu)["chantier"] == jeu.chantiers[0]
    assert _fiche(plateforme, jeu)["salaire"] == 3000


def test_supprimer_le_dernier_bulletin_recalcule_la_fiche(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], jeu: Jeu
) -> None:
    entetes = _entetes(connecter)
    _creer(plateforme, entetes, jeu, 1, chantier=0, equipe=0)
    dernier = _creer(plateforme, entetes, jeu, 2, chantier=1)
    assert _fiche(plateforme, jeu)["chantier"] == jeu.chantiers[1]
    assert plateforme.client.delete(f"/paie/{dernier['id']}", headers=entetes).status_code == 204
    assert _fiche(plateforme, jeu)["chantier"] == jeu.chantiers[0]
    assert _fiche(plateforme, jeu)["equipe"] == jeu.equipes[0]
    assert _fiche(plateforme, jeu)["fonction"] == jeu.fonctions[0]

    sortie = _creer(plateforme, entetes, jeu, 3, observation="STC")
    assert _fiche(plateforme, jeu)["statut"] == "INACTIF"
    assert plateforme.client.delete(f"/paie/{sortie['id']}", headers=entetes).status_code == 204
    assert _departs(plateforme, jeu) == []
    assert _fiche(plateforme, jeu)["statut"] == "ACTIF"
    assert _fiche(plateforme, jeu)["chantier"] == jeu.chantiers[0]


def test_retour_apres_depart_par_un_bulletin_plus_recent(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], jeu: Jeu
) -> None:
    entetes = _entetes(connecter)
    _creer(plateforme, entetes, jeu, 1, observation="STC")
    assert _fiche(plateforme, jeu)["statut"] == "INACTIF"
    _creer(plateforme, entetes, jeu, 2, chantier=1, equipe=1)
    assert _fiche(plateforme, jeu) == {
        "statut": "ACTIF",
        "fonction": jeu.fonctions[1],
        "chantier": jeu.chantiers[1],
        "equipe": jeu.equipes[1],
        "salaire": 3001,
    }
    assert _departs(plateforme, jeu) == [(208801, "STC")]


def test_retour_refuse_sans_type_de_salaire(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], jeu: Jeu
) -> None:
    entetes = _entetes(connecter)
    _creer(plateforme, entetes, jeu, 1, observation="STC")
    with plateforme.moteur.begin() as c:
        c.execute(text("UPDATE employe SET type_salaire = NULL WHERE id = :e"), {"e": jeu.employe})
    reponse = plateforme.client.post("/paie", headers=entetes, json=_corps(jeu, 2))
    assert reponse.status_code == 409
    assert "type de salaire" in reponse.text
    assert _fiche(plateforme, jeu)["statut"] == "INACTIF"


def test_sorties_du_mois_detaillent_le_dernier_bulletin_et_taisent_la_paie_sans_droit(
    plateforme: Plateforme,
    connecter: Callable[[str, str], dict[str, Any]],
    creer_utilisateur: Callable[..., tuple[int, str]],
    jeu: Jeu,
) -> None:
    entetes = _entetes(connecter)
    _creer(plateforme, entetes, jeu, 1, chantier=1, equipe=1)
    _creer(plateforme, entetes, jeu, 2, chantier=1, equipe=1, observation="STC")
    with plateforme.moteur.begin() as c:
        code = c.execute(text("SELECT code FROM chantier WHERE id = :c"), {"c": jeu.chantiers[1]}).scalar_one()
        libelle_equipe = c.execute(text("SELECT libelle FROM equipe WHERE id = :e"), {"e": jeu.equipes[1]}).scalar_one()
        libelle_fonction = c.execute(
            text("SELECT libelle FROM fonction WHERE id = :f"), {"f": jeu.fonctions[1]}
        ).scalar_one()

    reponse = plateforme.client.post("/employees/sorties-mois", headers=entetes, json={"periode": "2088-02"})
    assert reponse.status_code == 200, reponse.text
    sortie = next(x for x in reponse.json()["sorties"] if x["employeId"] == jeu.employe)
    assert sortie["motif"] == "STC" and sortie["statutActuel"] == "INACTIF"
    assert sortie["ancienneteMois"] == (2088 - 2020) * 12 + 1
    assert sortie["fonction"] == libelle_fonction and sortie["chantier"] == code
    assert sortie["equipe"] == libelle_equipe and sortie["dernierePaie"] == "2088-02"
    assert sortie["joursTravailles"] == 26 and sortie["observation"] == "STC"
    assert sortie["montantDernierBulletin"] == 3001 and sortie["salaire"] == 1000

    _identifiant, mot_de_passe = creer_utilisateur(
        roles=("SYSTEM_ADMIN",), refusees=("PAIE_READ",), username="sans-paie-sortie"
    )
    sans_paie = {"Authorization": f"Bearer {connecter('sans-paie-sortie', mot_de_passe)['accessToken']}"}
    reponse = plateforme.client.post("/employees/sorties-mois", headers=sans_paie, json={"periode": "2088-02"})
    assert reponse.status_code == 200, reponse.text
    masquee = next(x for x in reponse.json()["sorties"] if x["employeId"] == jeu.employe)
    assert masquee["chantier"] == code and masquee["motif"] == "STC"
    for champ in ("salaire", "typeSalaire", "joursTravailles", "montantDernierBulletin", "observation"):
        assert masquee[champ] is None, champ

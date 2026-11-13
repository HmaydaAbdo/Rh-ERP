"""Entrants et sorties d'un mois : définition, filtres communs et masquage de la paie sans droit.

Jeu sur 2086-01 à 2086-03 (PostgreSQL réel) :
- Alpha : payé les trois mois, jamais entrant ;
- Bravo : payé en mars seulement, nouvelle embauche de mars ;
- Charlie : payé en janvier et mars, absent en février, retour de mars (venait du chantier 0) ;
- Delta : payé en février et mars, entrant de février ; parti en mars (STC), son dernier bulletin est celui de mars.
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
    marque: str
    fonction: int
    chantiers: tuple[int, int]
    equipe: int
    employes: dict[str, int]


def _inserer(plateforme: Plateforme, requete: str, **valeurs: Any) -> int:
    with plateforme.moteur.begin() as c:
        return c.execute(text(requete), valeurs).scalar_one()


def _bulletin(plateforme: Plateforme, jeu: Jeu, nom: str, periode: int, chantier: int, equipe: bool = False) -> None:
    with plateforme.moteur.begin() as c:
        c.execute(
            text(
                "INSERT INTO paie (employee_id, periode, fonction_id, chantier_id, equipe_id, nombre_jours_travailles, "
                "salaire_mensuel, salaire_total) VALUES (:e, :p, :f, :c, :q, 26, 3000, :t)"
            ),
            {
                "e": jeu.employes[nom],
                "p": periode,
                "f": jeu.fonction,
                "c": jeu.chantiers[chantier],
                "q": jeu.equipe if equipe else None,
                "t": 3000 + chantier,
            },
        )


@pytest.fixture
def jeu(plateforme: Plateforme) -> Iterator[Jeu]:
    marque = uuid.uuid4().hex[:6].upper()
    fonction = _inserer(plateforme, "INSERT INTO fonction (libelle) VALUES (:l) RETURNING id", l=f"MV{marque}")
    chantiers = tuple(
        _inserer(
            plateforme,
            "INSERT INTO chantier (code, designation) VALUES (:c, :d) RETURNING id",
            c=f"MV{marque}{i}",
            d=f"Chantier {i}",
        )
        for i in range(2)
    )
    equipe = _inserer(
        plateforme, "INSERT INTO equipe (code, libelle) VALUES (:c, :l) RETURNING id", c=f"Q{marque}", l=f"Eq {marque}"
    )
    employes = {
        nom: _inserer(
            plateforme,
            "INSERT INTO employe (nom_prenom, cin, date_naissance, date_embauche, fonction_id, chantier_id, statut, "
            "salaire, type_salaire) VALUES (:n, :cin, '1990-01-01', '2020-01-01', :f, :c, 'ACTIF', 1000, 'MENSUEL') "
            "RETURNING id",
            n=f"{nom} {marque}",
            cin=f"{nom[:2].upper()}{marque}",
            f=fonction,
            c=chantiers[0],
        )
        for nom in ("Alpha", "Bravo", "Charlie", "Delta")
    }
    donnees = Jeu(marque, fonction, (chantiers[0], chantiers[1]), equipe, employes)
    for mois in (208601, 208602, 208603):
        _bulletin(plateforme, donnees, "Alpha", mois, 0)
    _bulletin(plateforme, donnees, "Bravo", 208603, 1)
    _bulletin(plateforme, donnees, "Charlie", 208601, 0, equipe=True)
    _bulletin(plateforme, donnees, "Charlie", 208603, 1)
    _bulletin(plateforme, donnees, "Delta", 208602, 0)
    _bulletin(plateforme, donnees, "Delta", 208603, 0)
    yield donnees
    with plateforme.moteur.begin() as c:
        ids = list(employes.values())
        c.execute(text("DELETE FROM paie WHERE employee_id = ANY(:e)"), {"e": ids})
        c.execute(text("DELETE FROM employe_sortie WHERE employee_id = ANY(:e)"), {"e": ids})
        c.execute(text("DELETE FROM employe WHERE id = ANY(:e)"), {"e": ids})
        c.execute(text("DELETE FROM chantier WHERE id = ANY(:c)"), {"c": list(chantiers)})
        c.execute(text("DELETE FROM equipe WHERE id = :e"), {"e": equipe})
        c.execute(text("DELETE FROM fonction WHERE id = :f"), {"f": fonction})


def _entetes(connecter: Callable[[str, str], dict[str, Any]]) -> dict[str, str]:
    return {"Authorization": f"Bearer {connecter(*ADMIN)['accessToken']}"}


def _entrants(plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu, **filtres: Any) -> dict[str, Any]:
    reponse = plateforme.client.post(
        "/employees/entrants-mois", headers=entetes, json={"periode": "2086-03", "nomPrenom": jeu.marque, **filtres}
    )
    assert reponse.status_code == 200, reponse.text
    return reponse.json()


def _noms(corps: dict[str, Any], cle: str) -> list[str]:
    return [ligne["nomPrenom"].split()[0] for ligne in corps[cle]]


def test_les_entrants_sont_payes_ce_mois_et_pas_le_mois_civil_precedent(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], jeu: Jeu
) -> None:
    entetes = _entetes(connecter)
    mars = _entrants(plateforme, entetes, jeu)
    fevrier = plateforme.client.post(
        "/employees/entrants-mois", headers=entetes, json={"periode": "2086-02", "nomPrenom": jeu.marque}
    ).json()

    assert mars["comparable"] is True
    assert (mars["nombre"], mars["nouvellesEmbauches"], mars["retours"]) == (2, 1, 1)
    assert _noms(mars, "entrants") == ["Bravo", "Charlie"]
    bravo, charlie = mars["entrants"]
    assert bravo["type"] == "NOUVELLE_EMBAUCHE" and bravo["chantierPrecedent"] is None
    assert charlie["type"] == "RETOUR" and charlie["chantierPrecedent"] == f"MV{jeu.marque}0"
    assert charlie["chantierId"] == jeu.chantiers[1] and charlie["chantier"] == f"MV{jeu.marque}1"
    assert charlie["dernierePaiePrecedente"] == "2086-01" and charlie["montantBulletin"] == 3001
    assert charlie["joursTravailles"] == 26 and charlie["dateEmbauche"] == "2020-01-01"
    assert _noms(fevrier, "entrants") == ["Delta"]


def test_un_mois_sans_bulletin_ou_sans_mois_precedent_n_est_pas_comparable(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], jeu: Jeu
) -> None:
    entetes = _entetes(connecter)
    for periode in ("2086-01", "2086-05"):
        corps = plateforme.client.post("/employees/entrants-mois", headers=entetes, json={"periode": periode}).json()
        assert corps["comparable"] is False, periode
        assert corps["nombre"] == 0 and corps["entrants"] == []


def test_les_filtres_communs_et_le_type_restreignent_les_entrants(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], jeu: Jeu
) -> None:
    entetes = _entetes(connecter)
    assert _noms(_entrants(plateforme, entetes, jeu, types=["RETOUR"]), "entrants") == ["Charlie"]
    assert _noms(_entrants(plateforme, entetes, jeu, nomPrenom="brav"), "entrants") == ["Bravo"]
    assert _noms(_entrants(plateforme, entetes, jeu, chantierIds=[jeu.chantiers[0]]), "entrants") == []
    assert _noms(_entrants(plateforme, entetes, jeu, chantierIds=[jeu.chantiers[1]]), "entrants") == [
        "Bravo",
        "Charlie",
    ]
    assert _noms(_entrants(plateforme, entetes, jeu, equipeIds=[0]), "entrants") == ["Bravo", "Charlie"]
    assert _noms(_entrants(plateforme, entetes, jeu, equipeIds=[jeu.equipe]), "entrants") == []
    assert _noms(_entrants(plateforme, entetes, jeu, fonctionIds=[jeu.fonction + 10_000]), "entrants") == []
    filtre = _entrants(plateforme, entetes, jeu, cin=f"ch{jeu.marque}".lower())
    assert (filtre["nombre"], filtre["retours"], filtre["nouvellesEmbauches"]) == (1, 1, 0)


def test_les_entrants_taisent_la_paie_sans_droit(
    plateforme: Plateforme,
    connecter: Callable[[str, str], dict[str, Any]],
    creer_utilisateur: Callable[..., tuple[int, str]],
    jeu: Jeu,
) -> None:
    _identifiant, mot_de_passe = creer_utilisateur(
        roles=("SYSTEM_ADMIN",), refusees=("PAIE_READ",), username="sans-paie-entrant"
    )
    sans_paie = {"Authorization": f"Bearer {connecter('sans-paie-entrant', mot_de_passe)['accessToken']}"}
    entrant = _entrants(plateforme, sans_paie, jeu)["entrants"][0]
    assert entrant["chantier"] == f"MV{jeu.marque}1"
    for champ in ("salaire", "typeSalaire", "joursTravailles", "montantBulletin", "observation"):
        assert entrant[champ] is None, champ


def test_les_filtres_s_appliquent_aux_sorties_selon_le_dernier_bulletin(
    plateforme: Plateforme, connecter: Callable[[str, str], dict[str, Any]], jeu: Jeu
) -> None:
    entetes = _entetes(connecter)
    with plateforme.moteur.begin() as c:
        for nom, motif in (("Delta", "STC"), ("Alpha", "ABANDON")):
            c.execute(
                text("INSERT INTO employe_sortie (employee_id, periode, motif) VALUES (:e, 208603, :m)"),
                {"e": jeu.employes[nom], "m": motif},
            )

    def sorties(**filtres: Any) -> dict[str, Any]:
        reponse = plateforme.client.post(
            "/employees/sorties-mois",
            headers=entetes,
            json={"periode": "2086-03", "nomPrenom": jeu.marque, **filtres},
        )
        assert reponse.status_code == 200, reponse.text
        return reponse.json()

    tous = sorties()
    assert (tous["nombre"], tous["parMotif"]) == (2, {"ABANDON": 1, "STC": 1})
    stc = sorties(motifs=["STC"])
    assert _noms(stc, "sorties") == ["Delta"] and stc["nombre"] == 1
    assert stc["parMotif"] == {"ABANDON": 1, "STC": 1}, "les motifs restent proposés malgré le filtre de motif"
    assert stc["sorties"][0]["chantierId"] == jeu.chantiers[0] and stc["sorties"][0]["fonctionId"] == jeu.fonction
    assert sorties(chantierIds=[jeu.chantiers[1]])["nombre"] == 0
    assert sorties(equipeIds=[0], nomPrenom="delta")["nombre"] == 1
    assert sorties(equipeIds=[jeu.equipe])["nombre"] == 0

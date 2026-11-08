"""Contrat du parcours : Angular lit `indicateurs` imbriqué, comme `ParcoursEmployeDto` de Spring."""
# ruff: noqa: F811  (les fixtures `jeu` et `entetes` importées de test_heuresupp sont reprises par nom)

import uuid
from collections.abc import Iterator
from dataclasses import dataclass

import pytest
from conftest import Plateforme
from sqlalchemy import text
from test_heuresupp import MOIS, Jeu, entetes, jeu  # noqa: F401  # pyright: ignore[reportUnusedImport, reportPrivateUsage]

from staport.domains.paie.periode import mois_precedent


def test_le_parcours_imbrique_ses_indicateurs(plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu) -> None:
    reponse = plateforme.client.get(f"/paie/employes/{jeu.employes[0]}/parcours", headers=entetes)

    assert reponse.status_code == 200, reponse.text
    corps = reponse.json()
    assert set(corps) == {"employeId", "indicateurs", "mois", "evenements"}
    assert set(corps["indicateurs"]) == {"moisPayes", "totalPercu", "joursTravailles", "premierMois", "dernierMois"}
    assert corps["indicateurs"]["moisPayes"] == len(corps["mois"]) >= 1
    assert corps["indicateurs"]["premierMois"] == MOIS
    assert isinstance(corps["indicateurs"]["totalPercu"], int | float)


# --- Parité Spring : libellés, événements, effectifs, codes HTTP (KAN-226) ---


@dataclass
class Scenario:
    employes: dict[str, int]
    chantiers: list[int]
    fonctions: list[int]
    codes_chantier: list[str]
    libelles_fonction: list[str]
    code_equipe: str
    equipe: int


@pytest.fixture
def scenario(plateforme: Plateforme) -> Iterator[Scenario]:
    marque = uuid.uuid4().hex[:8]
    with plateforme.moteur.begin() as c:
        codes = [f"P{marque}{i}" for i in range(2)]
        libelles = [f"Fct {marque} {i}" for i in range(2)]
        chantiers = [
            c.execute(
                text("INSERT INTO chantier (code, designation, nom) VALUES (:c, 'P', 'N') RETURNING id"), {"c": code}
            ).scalar_one()
            for code in codes
        ]
        fonctions = [
            c.execute(text("INSERT INTO fonction (libelle) VALUES (:l) RETURNING id"), {"l": libelle}).scalar_one()
            for libelle in libelles
        ]
        code_equipe = f"Q{marque}"
        equipe = c.execute(
            text("INSERT INTO equipe (code, libelle) VALUES (:c, 'Equipe P') RETURNING id"), {"c": code_equipe}
        ).scalar_one()
        employes = {
            nom: c.execute(
                text(
                    "INSERT INTO employe (nom_prenom, cin, date_naissance, date_embauche, fonction_id, chantier_id, "
                    "statut) VALUES (:n, :cin, '1990-01-01', '2020-01-01', :f, :c, 'ACTIF') RETURNING id"
                ),
                {"n": f"Parcours {nom}", "cin": f"PC{marque}{nom}", "f": fonctions[0], "c": chantiers[0]},
            ).scalar_one()
            for nom in ("A", "B", "C")
        }
        # (employé, mois, rang du chantier, rang de la fonction, équipe, salaire mensuel)
        bulletins = [
            ("A", 209711, 0, 0, equipe, 100),
            ("B", 209711, 0, 0, None, 100),
            ("A", 209712, 1, 1, None, 150),
            ("C", 209712, 0, 0, None, 100),
            ("C", 209801, 0, 0, None, 100),
            ("A", 209802, 1, 1, None, 150),
            ("C", 209802, 0, 0, None, 100),
        ]
        for nom, mois, rang_chantier, rang_fonction, equipe_bulletin, salaire in bulletins:
            c.execute(
                text(
                    "INSERT INTO paie (employee_id, periode, fonction_id, chantier_id, equipe_id, "
                    "nombre_jours_travailles, salaire_mensuel, salaire_total) VALUES (:e, :p, :f, :c, :q, 26, :s, :s)"
                ),
                {
                    "e": employes[nom],
                    "p": mois,
                    "f": fonctions[rang_fonction],
                    "c": chantiers[rang_chantier],
                    "q": equipe_bulletin,
                    "s": salaire,
                },
            )
        for nom, motif in (("A", "STC"), ("B", "ABANDON")):
            c.execute(
                text("INSERT INTO employe_sortie (employee_id, periode, motif) VALUES (:e, 209712, :m)"),
                {"e": employes[nom], "m": motif},
            )
    yield Scenario(employes, chantiers, fonctions, codes, libelles, code_equipe, equipe)
    ids = list(employes.values())
    with plateforme.moteur.begin() as c:
        c.execute(text("DELETE FROM employe_sortie WHERE employee_id = ANY(:e)"), {"e": ids})
        c.execute(text("DELETE FROM paie WHERE employee_id = ANY(:e)"), {"e": ids})
        c.execute(text("DELETE FROM employe WHERE id = ANY(:e)"), {"e": ids})
        c.execute(text("DELETE FROM equipe WHERE id = :q"), {"q": equipe})
        c.execute(text("DELETE FROM chantier WHERE id = ANY(:c)"), {"c": chantiers})
        c.execute(text("DELETE FROM fonction WHERE id = ANY(:f)"), {"f": fonctions})


def test_les_mois_du_parcours_portent_les_libelles_et_les_codes(
    plateforme: Plateforme, entetes: dict[str, str], scenario: Scenario
) -> None:
    reponse = plateforme.client.get(f"/paie/employes/{scenario.employes['A']}/parcours", headers=entetes)

    corps = reponse.json()
    assert [m["periode"] for m in corps["mois"]] == ["2098-02", "2097-12", "2097-11"]
    premier, dernier = corps["mois"][0], corps["mois"][2]
    assert set(premier) == {
        "bulletinId",
        "periode",
        "fonction",
        "chantier",
        "equipe",
        "nombreJoursTravailles",
        "salaireMensuel",
        "salaireTotal",
        "observation",
    }
    assert (premier["fonction"], premier["chantier"], premier["equipe"]) == (
        scenario.libelles_fonction[1],
        scenario.codes_chantier[1],
        None,
    )
    assert (dernier["fonction"], dernier["chantier"], dernier["equipe"]) == (
        scenario.libelles_fonction[0],
        scenario.codes_chantier[0],
        scenario.code_equipe,
    )
    assert corps["indicateurs"] == {
        "moisPayes": 3,
        "totalPercu": 400,
        "joursTravailles": 78,
        "premierMois": "2097-11",
        "dernierMois": "2098-02",
    }


def test_les_evenements_du_parcours_suivent_spring_entree_changements_depart_retour(
    plateforme: Plateforme, entetes: dict[str, str], scenario: Scenario
) -> None:
    reponse = plateforme.client.get(f"/paie/employes/{scenario.employes['A']}/parcours", headers=entetes)

    evenements = [(e["periode"], e["type"], e["avant"], e["apres"], e["motif"]) for e in reponse.json()["evenements"]]
    f0, f1 = scenario.libelles_fonction
    c0, c1 = scenario.codes_chantier
    assert evenements == [
        ("2098-02", "RETOUR", None, None, None),
        ("2097-12", "DEPART", None, None, "STC"),
        ("2097-12", "CHANGEMENT_SALAIRE", "100.00", "150.00", None),
        ("2097-12", "CHANGEMENT_EQUIPE", scenario.code_equipe, None, None),
        ("2097-12", "CHANGEMENT_FONCTION", f0, f1, None),
        ("2097-12", "CHANGEMENT_CHANTIER", c0, c1, None),
        ("2097-11", "ENTREE", None, f"{c0} · {f0}", None),
    ]


def test_parcours_d_un_employe_inconnu_est_un_404(plateforme: Plateforme, entetes: dict[str, str]) -> None:
    reponse = plateforme.client.get("/paie/employes/999999999/parcours", headers=entetes)

    assert reponse.status_code == 404
    assert reponse.json()["message"] == "Employé introuvable avec l'id : 999999999"


def test_les_effectifs_comptent_entrees_sorties_mutations_et_enjambent_janvier(
    plateforme: Plateforme, entetes: dict[str, str], scenario: Scenario
) -> None:
    reponse = plateforme.client.post("/paie/effectifs", headers=entetes, json={"chantierIds": scenario.chantiers})

    assert reponse.status_code == 200, reponse.text
    corps = reponse.json()
    assert set(corps[0]) == {
        "periode",
        "effectif",
        "effectifMoisPrecedent",
        "variation",
        "entrees",
        "plusPayes",
        "sorties",
        "mutations",
    }
    assert [
        (
            m["periode"],
            m["effectif"],
            m["effectifMoisPrecedent"],
            m["variation"],
            m["entrees"],
            m["plusPayes"],
            m["sorties"],
            m["mutations"],
        )
        for m in corps
    ] == [
        ("2097-11", 2, None, None, None, None, 0, None),
        ("2097-12", 2, 2, 0, 1, 1, 2, 1),
        ("2098-01", 1, 2, -1, 0, 1, 0, 0),  # janvier : le mois précédent est 2097-12, pas 2098-00
        ("2098-02", 2, 1, 1, 1, 0, 0, 0),
    ]


def test_mois_precedent_enjambe_l_annee() -> None:
    assert mois_precedent(202601) == 202512
    assert mois_precedent(202603) == 202602


def test_les_statuts_http_des_bulletins_suivent_spring(
    plateforme: Plateforme, entetes: dict[str, str], scenario: Scenario
) -> None:
    absent = plateforme.client.get("/paie/999999999", headers=entetes)
    doublon = plateforme.client.post(
        "/paie",
        headers=entetes,
        json={
            "employeeId": scenario.employes["A"],
            "periode": "2097-11",
            "fonctionId": scenario.fonctions[0],
            "chantierId": scenario.chantiers[0],
            "nombreJoursTravailles": 26,
            "salaireMensuel": 100,
            "salaireTotal": 100,
        },
    )

    assert absent.status_code == 404
    assert absent.json()["message"] == "Bulletin de paie introuvable avec l'id : 999999999"
    assert doublon.status_code == 409, doublon.text
    assert doublon.json()["message"] == (
        f"Un bulletin de paie existe déjà pour l'employé id={scenario.employes['A']} sur la période 2097-11"
    )

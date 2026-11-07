"""Outils MCP Employé, Paie, rapport, heures supplémentaires et accueil (KAN-216, parité `OutilsEmploye`, `OutilsPaie`,
`OutilsHeuresSupp`, `OutilsAccueil` de Spring), par appels JSON-RPC sur `/mcp` avec un PostgreSQL réel.

Jeu de données : trois mois de paie (2096-01, 2096-02, 2096-04), un départ en 2096-02 (STC), un en 2096-03 (absence), un
sans motif en 2096-05 ; les périmètres de chaque test se limitent à ces chantiers et fonctions, pour ne dépendre
d'aucune autre donnée de la base partagée.
"""

# Le client de test de Starlette n'expose pas de types complets : cette règle n'est levée que pour ce fichier.
# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false, reportUnknownArgumentType=false
# ruff: noqa: F811  (les fixtures `admin`, `jeu` et `entetes` importées sont reprises par nom)

import uuid
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

import pytest
from conftest import Plateforme
from sqlalchemy import text
from test_heuresupp import MOIS, Jeu, entetes, jeu  # noqa: F401  # pyright: ignore[reportUnusedImport, reportPrivateUsage]
from test_mcp import (  # pyright: ignore[reportPrivateUsage]
    Fabrique,
    _appel,  # pyright: ignore[reportPrivateUsage]
    _donnees,  # pyright: ignore[reportPrivateUsage]
    _jeton_agent,  # pyright: ignore[reportPrivateUsage]
    _nom,  # pyright: ignore[reportPrivateUsage]
    _nombre_d_entrees,  # pyright: ignore[reportPrivateUsage]
    _rpc,  # pyright: ignore[reportPrivateUsage]
    admin,  # noqa: F401  # pyright: ignore[reportUnusedImport]
)

M1, M2, M3, M4, M5 = 209601, 209602, 209603, 209604, 209605
S1, S2, S4 = "2096-01", "2096-02", "2096-04"


@dataclass
class Donnees:
    marque: str
    fonctions: list[int]  # F1 (A, B, C), F2 (D)
    chantiers: list[int]  # C1, C2, C3 (hors périmètre des tests de paie : D)
    equipe: int
    employes: dict[str, int]  # A, B, C, D
    codes: list[str]  # codes de C1, C2, C3
    libelles: list[str]  # libellés de F1, F2


@pytest.fixture
def donnees(plateforme: Plateforme) -> Iterator[Donnees]:
    marque = uuid.uuid4().hex[:8]
    aujourd_hui = date.today()
    with plateforme.moteur.begin() as c:
        libelles = [f"Fonction {marque} {rang}" for rang in (1, 2)]
        fonctions = [
            c.execute(text("INSERT INTO fonction (libelle) VALUES (:l) RETURNING id"), {"l": libelle}).scalar_one()
            for libelle in libelles
        ]
        codes = [f"K{marque}{rang}" for rang in (1, 2, 3)]
        chantiers = [
            c.execute(
                text("INSERT INTO chantier (code, designation, nom) VALUES (:c, 'Désignation', :n) RETURNING id"),
                {"c": code, "n": f"Chantier {code}"},
            ).scalar_one()
            for code in codes
        ]
        equipe = c.execute(
            text("INSERT INTO equipe (code, libelle) VALUES (:c, 'Equipe MCP') RETURNING id"), {"c": f"Q{marque}"}
        ).scalar_one()

        def employe(nom: str, fonction: int, chantier: int | None, statut: str, embauche: date, salaire: int) -> int:
            return c.execute(
                text(
                    "INSERT INTO employe (nom_prenom, cin, date_naissance, date_embauche, fonction_id, chantier_id, "
                    "statut, salaire, type_salaire) VALUES (:n, :cin, '1990-01-01', :e, :f, :c, :s, :sal, 'MENSUEL') "
                    "RETURNING id"
                ),
                {
                    "n": f"{nom} {marque}",
                    "cin": f"CIN{marque}{nom[:1]}",
                    "e": embauche,
                    "f": fonction,
                    "c": chantier,
                    "s": statut,
                    "sal": salaire,
                },
            ).scalar_one()

        employes = {
            "A": employe("Alpha", fonctions[0], chantiers[0], "ACTIF", date(2020, 1, 1), 3000),
            "B": employe("Bravo", fonctions[0], chantiers[1], "ACTIF", aujourd_hui - timedelta(days=30), 4000),
            "C": employe("Charlie", fonctions[0], None, "INACTIF", date(2019, 6, 1), 5000),
            "D": employe("Delta", fonctions[1], chantiers[2], "ACTIF", date(2018, 3, 1), 2500),
        }

        def bulletin(clef: str, periode: int, chantier: int, fonction: int, equipe_id: int | None, total: int) -> None:
            c.execute(
                text(
                    "INSERT INTO paie (employee_id, periode, fonction_id, chantier_id, equipe_id, "
                    "nombre_jours_travailles, salaire_mensuel, salaire_total) "
                    "VALUES (:e, :p, :f, :c, :q, 26, :t, :t)"
                ),
                {"e": employes[clef], "p": periode, "f": fonction, "c": chantier, "q": equipe_id, "t": total},
            )

        f1, f2 = fonctions
        c1, c2, c3 = chantiers
        bulletin("A", M1, c1, f1, equipe, 1000)
        bulletin("B", M1, c1, f1, None, 2000)
        bulletin("C", M1, c2, f1, None, 3000)
        bulletin("A", M2, c1, f1, equipe, 1100)
        bulletin("B", M2, c2, f1, None, 2200)
        bulletin("D", M1, c3, f2, None, 1500)
        bulletin("D", M4, c3, f2, None, 1600)
        for clef, periode, motif in (("C", M2, "STC"), ("D", M3, "Absence"), ("A", M5, " ")):
            c.execute(
                text("INSERT INTO employe_sortie (employee_id, periode, motif) VALUES (:e, :p, :m)"),
                {"e": employes[clef], "p": periode, "m": motif},
            )
    yield Donnees(marque, fonctions, chantiers, equipe, employes, codes, libelles)
    with plateforme.moteur.begin() as c:
        ids = list(employes.values())
        c.execute(text("DELETE FROM employe_sortie WHERE employee_id = ANY(:e)"), {"e": ids})
        c.execute(text("DELETE FROM paie WHERE employee_id = ANY(:e)"), {"e": ids})
        c.execute(text("DELETE FROM employe WHERE id = ANY(:e)"), {"e": ids})
        c.execute(text("DELETE FROM equipe WHERE id = :q"), {"q": equipe})
        c.execute(text("DELETE FROM chantier WHERE id = ANY(:c)"), {"c": chantiers})
        c.execute(text("DELETE FROM fonction WHERE id = ANY(:f)"), {"f": fonctions})


def _sans(p: Plateforme, creer: Fabrique, connecter: Callable[[str, str], dict[str, Any]], *refusees: str) -> str:
    """Le jeton agent d'un administrateur auquel les permissions `refusees` sont retirées."""
    identifiant, mdp = creer("mcp-metier", roles=("SYSTEM_ADMIN",), refusees=refusees)
    return _jeton_agent(p, connecter, _nom(p, identifiant), mdp)


def _perimetre(d: Donnees) -> dict[str, Any]:
    """Chantiers C1 et C2 : les bulletins de A, B et C (D est payé sur C3)."""
    return {"chantierIds": d.chantiers[:2]}


# --- Catalogue et droits ---------------------------------------------------------------------------

OUTILS_PORTES: dict[str, tuple[tuple[str, ...], dict[str, Any]]] = {
    "accueil_lire": (("ACCUEIL_READ",), {}),
    "employes_rechercher": (("EMPLOYEE_READ",), {"nom": "zz"}),
    "employe_fiche": (("EMPLOYEE_READ",), {"id": 1}),
    "employes_compter": (("EMPLOYEE_READ",), {}),
    "employes_regrouper": (("EMPLOYEE_READ",), {"dimension": "CHANTIER"}),
    "employes_sorties": (("EMPLOYEE_READ",), {"periode": S2}),
    "employe_parcours": (("PAIE_READ",), {"id": 1}),
    "paie_indicateurs": (("PAIE_READ",), {"periode": S2}),
    "paie_periodes": (("PAIE_READ",), {}),
    "paie_repartition": (("PAIE_READ",), {"dimension": "CHANTIER", "periode": S2}),
    "paie_evolution": (("PAIE_READ",), {"periode": S2}),
    "paie_comparer": (("PAIE_READ",), {"dimension": "CHANTIER", "periode": S2}),
    "paie_mouvements": (("PAIE_READ",), {}),
    "paie_qualite": (("PAIE_READ",), {"periode": S2}),
    "paie_bulletins_rechercher": (("PAIE_READ",), {"periode": S2}),
    "rapport_preparer": (("PAIE_EXPORT", "PAIE_READ"), {"periode": S2}),
    "heures_supp_periodes": (("HEURES_SUP_READ", "PAIE_READ"), {}),
    "heures_supp_indicateurs": (("HEURES_SUP_READ", "PAIE_READ"), {"periode": S2}),
    "heures_supp_rechercher": (("HEURES_SUP_READ", "PAIE_READ"), {"periode": S2}),
    "heures_supp_import_prerequis": (
        ("HEURES_SUP_IMPORT", "PAIE_READ", "CHANTIER_READ"),
        {"periode": S2, "chantierId": 1},
    ),
}


def test_le_catalogue_compte_les_31_outils_de_spring_en_lecture_seule(
    plateforme: Plateforme, admin: tuple[str, str, int]
) -> None:
    outils = {o["name"]: o for o in _rpc(plateforme, admin[0], "tools/list").json()["result"]["tools"]}
    assert len(outils) == 31
    assert set(OUTILS_PORTES) <= set(outils)
    for nom in OUTILS_PORTES:
        outil = outils[nom]
        assert outil["annotations"]["readOnlyHint"] is True and outil["annotations"]["destructiveHint"] is False
        assert outil["annotations"]["idempotentHint"] is True and outil["annotations"]["openWorldHint"] is False
        assert outil["description"] and outil["outputSchema"] and outil["title"]
    schema = outils["paie_comparer"]["inputSchema"]["properties"]
    assert {
        "dimension",
        "periode",
        "periodeReference",
        "chantierIds",
        "equipeIds",
        "fonctionIds",
        "tri",
        "sens",
    } == set(schema)
    assert schema["tri"]["anyOf"][0]["enum"] == [
        "MASSE",
        "VARIATION_MASSE",
        "VARIATION_POURCENTAGE",
        "EFFECTIF",
        "VARIATION_EFFECTIF",
        "LIBELLE",
    ]


@pytest.mark.parametrize("outil", sorted(OUTILS_PORTES))
def test_chaque_outil_exige_toutes_les_permissions_de_son_ecran(
    plateforme: Plateforme,
    creer_utilisateur: Fabrique,
    connecter: Callable[[str, str], dict[str, Any]],
    outil: str,
) -> None:
    permissions, arguments = OUTILS_PORTES[outil]
    for permission in permissions:
        jeton = _sans(plateforme, creer_utilisateur, connecter, permission)
        resultat = _appel(plateforme, jeton, outil, **arguments)
        assert resultat["isError"] is True and permission in resultat["content"][0]["text"], (outil, permission)


def test_les_appels_ne_laissent_aucune_ligne_d_audit(
    plateforme: Plateforme, admin: tuple[str, str, int], donnees: Donnees
) -> None:
    avant = _nombre_d_entrees(plateforme)
    for outil, (_, arguments) in OUTILS_PORTES.items():
        if outil != "heures_supp_import_prerequis":
            _appel(plateforme, admin[0], outil, **arguments)
    _donnees(_appel(plateforme, admin[0], "employe_parcours", id=donnees.employes["B"]))
    assert _nombre_d_entrees(plateforme) == avant


# --- Employés --------------------------------------------------------------------------------------


def test_la_recherche_d_employes_rend_les_champs_de_l_ecran_et_le_salaire_avec_la_paie(
    plateforme: Plateforme, admin: tuple[str, str, int], donnees: Donnees
) -> None:
    resultat = _donnees(_appel(plateforme, admin[0], "employes_rechercher", nom="Alpha " + donnees.marque))
    assert (resultat["total"], resultat["rendus"], resultat["page"], resultat["salaireVisible"]) == (1, 1, 0, True)
    fiche = resultat["employes"][0]
    assert fiche["id"] == donnees.employes["A"] and fiche["statut"] == "EN_POSTE"
    assert fiche["cin"] == f"CIN{donnees.marque}A" and fiche["dateNaissance"] == "1990-01-01"
    assert fiche["dateEmbauche"] == "2020-01-01"
    assert fiche["fonction"] == {"id": donnees.fonctions[0], "libelle": donnees.libelles[0]}
    assert fiche["chantier"] == {"id": donnees.chantiers[0], "code": donnees.codes[0]}
    assert fiche["salaire"] == 3000.0 and fiche["typeSalaire"] == "MENSUEL" and fiche["equipe"] is None
    assert resultat["vue"] == {
        "module": "employees",
        "vue": "tabulaire",
        "parametres": {"nom": "Alpha " + donnees.marque},
    }


def test_sans_la_paie_le_salaire_est_omis_et_le_tri_par_salaire_refuse(
    plateforme: Plateforme,
    creer_utilisateur: Fabrique,
    connecter: Callable[[str, str], dict[str, Any]],
    donnees: Donnees,
) -> None:
    jeton = _sans(plateforme, creer_utilisateur, connecter, "PAIE_READ")
    resultat = _donnees(_appel(plateforme, jeton, "employes_rechercher", fonctionIds=donnees.fonctions))
    assert resultat["salaireVisible"] is False and resultat["total"] == 4
    assert all("salaire" not in e and "typeSalaire" not in e for e in resultat["employes"])
    refus = _appel(plateforme, jeton, "employes_rechercher", fonctionIds=donnees.fonctions, tri="SALAIRE")
    assert refus["isError"] is True and "salaire" in refus["content"][0]["text"]
    fiche = _donnees(_appel(plateforme, jeton, "employe_fiche", id=donnees.employes["A"]))
    assert "salaire" not in fiche["employe"] and "typeSalaire" not in fiche["employe"]


def test_la_recherche_se_trie_se_pagine_et_exige_un_critere(
    plateforme: Plateforme, admin: tuple[str, str, int], donnees: Donnees
) -> None:
    jeton, perimetre = admin[0], {"fonctionIds": donnees.fonctions}
    par_nom = _donnees(_appel(plateforme, jeton, "employes_rechercher", **perimetre))
    assert [e["id"] for e in par_nom["employes"]] == [donnees.employes[k] for k in "ABCD"]
    recents = _donnees(_appel(plateforme, jeton, "employes_rechercher", tri="DATE_EMBAUCHE", limite=1, **perimetre))
    assert [e["id"] for e in recents["employes"]] == [donnees.employes["B"]] and recents["total"] == 4
    salaires = _donnees(_appel(plateforme, jeton, "employes_rechercher", tri="SALAIRE", sens="ASC", **perimetre))
    assert [e["salaire"] for e in salaires["employes"]] == [2500.0, 3000.0, 4000.0, 5000.0]
    page = _donnees(_appel(plateforme, jeton, "employes_rechercher", limite=2, page=1, **perimetre))
    assert [e["id"] for e in page["employes"]] == [donnees.employes["C"], donnees.employes["D"]]
    sortis = _donnees(_appel(plateforme, jeton, "employes_rechercher", statut="SORTI", **perimetre))
    assert [e["id"] for e in sortis["employes"]] == [donnees.employes["C"]]
    assert sortis["employes"][0]["statut"] == "SORTI" and sortis["employes"][0]["chantier"] is None
    assert sortis["vue"]["parametres"]["statut"] == "INACTIF"
    vide = _donnees(_appel(plateforme, jeton, "employes_rechercher", nom="aucun-nom-" + donnees.marque))
    assert vide["employes"] == [] and vide["total"] == 0
    sans_critere = _appel(plateforme, jeton, "employes_rechercher")
    assert sans_critere["isError"] is True and "Préciser un nom" in sans_critere["content"][0]["text"]
    for arguments in ({"nom": "a"}, {"cin": "x"}, {"nom": "zz", "limite": 21}, {"nom": "zz", "page": -1}):
        assert _appel(plateforme, jeton, "employes_rechercher", **arguments)["isError"] is True
    assert _appel(plateforme, jeton, "employes_rechercher", chantierIds=list(range(1, 52)))["isError"] is True


def test_la_fiche_rend_les_departs_et_refuse_un_identifiant_inconnu(
    plateforme: Plateforme, admin: tuple[str, str, int], donnees: Donnees
) -> None:
    fiche = _donnees(_appel(plateforme, admin[0], "employe_fiche", id=donnees.employes["A"]))
    assert fiche["employe"]["nomPrenom"] == f"Alpha {donnees.marque}" and fiche["employe"]["salaire"] == 3000.0
    assert fiche["departs"] == [{"periode": "2096-05", "motif": "NON_PRECISE"}]
    assert fiche["vue"] == {"module": "employees", "vue": "fiche", "parametres": {"id": str(donnees.employes["A"])}}
    inconnu = _appel(plateforme, admin[0], "employe_fiche", id=999999999)
    assert inconnu["isError"] is True and "Employé introuvable avec l'id : 999999999" in inconnu["content"][0]["text"]
    assert _appel(plateforme, admin[0], "employe_fiche", id=0)["isError"] is True


def test_le_comptage_donne_les_chiffres_de_l_analytique(
    plateforme: Plateforme, admin: tuple[str, str, int], donnees: Donnees
) -> None:
    resultat = _donnees(_appel(plateforme, admin[0], "employes_compter", fonctionIds=donnees.fonctions))
    assert (resultat["effectif"], resultat["enPoste"], resultat["sortis"]) == (4, 3, 1)
    assert resultat["embauchesDouzeMois"] == 1  # B, embauché il y a 30 jours
    assert sum(t["effectif"] for t in resultat["parAge"]) == 4
    assert [(t["min"], t["max"]) for t in resultat["parAge"]] == [(0, 25), (25, 35), (35, 45), (45, 55), (55, None)]
    assert [(t["min"], t["max"]) for t in resultat["parAnciennete"]] == [(0, 1), (1, 3), (3, 5), (5, 10), (10, None)]
    assert sum(t["effectif"] for t in resultat["parAnciennete"]) == 4
    attendu = (date.today() - date(1990, 1, 1)).days / 365.2425
    assert abs(resultat["ageMoyen"] - attendu) < 0.11
    assert (
        resultat["vue"]
        == {
            "module": "employees",
            "vue": "analytique",
            "parametres": {"fonctionIds": ",".join(map(str, donnees.fonctions))} | {},
        }
        or resultat["vue"]["vue"] == "analytique"
    )
    sortis = _donnees(_appel(plateforme, admin[0], "employes_compter", fonctionIds=donnees.fonctions, statut="SORTI"))
    assert (sortis["effectif"], sortis["enPoste"], sortis["sortis"]) == (1, 0, 1)
    assert sortis["vue"]["parametres"]["statut"] == "INACTIF"
    vide = _donnees(_appel(plateforme, admin[0], "employes_compter", chantierIds=[999999999]))
    assert vide["effectif"] == 0 and vide["ageMoyen"] is None and vide["ancienneteMoyenne"] is None


def test_le_regroupement_classe_les_groupes_et_nomme_les_sans_affectation(
    plateforme: Plateforme, admin: tuple[str, str, int], donnees: Donnees
) -> None:
    jeton, perimetre = admin[0], {"fonctionIds": donnees.fonctions}
    chantiers = _donnees(_appel(plateforme, jeton, "employes_regrouper", dimension="CHANTIER", **perimetre))
    assert chantiers["dimension"] == "CHANTIER" and chantiers["nombreGroupes"] == 4
    assert [g["code"] for g in chantiers["groupes"]] == [*donnees.codes, None]
    sans = chantiers["groupes"][-1]
    assert (sans["id"], sans["libelle"], sans["effectif"], sans["enPoste"]) == (0, "Sans chantier", 1, 0)
    assert chantiers["groupes"][0]["libelle"] == "Désignation"
    en_poste = _donnees(
        _appel(plateforme, jeton, "employes_regrouper", dimension="CHANTIER", tri="EN_POSTE", sens="ASC", **perimetre)
    )
    assert en_poste["groupes"][0]["id"] == 0
    fonctions = _donnees(_appel(plateforme, jeton, "employes_regrouper", dimension="FONCTION", **perimetre))
    assert [(g["libelle"], g["effectif"], g["enPoste"]) for g in fonctions["groupes"]] == [
        (donnees.libelles[0], 3, 2),
        (donnees.libelles[1], 1, 1),
    ]
    alphabetique = _donnees(
        _appel(plateforme, jeton, "employes_regrouper", dimension="FONCTION", tri="LIBELLE", sens="DESC", **perimetre)
    )
    assert [g["libelle"] for g in alphabetique["groupes"]] == [donnees.libelles[1], donnees.libelles[0]]
    equipes = _donnees(_appel(plateforme, jeton, "employes_regrouper", dimension="EQUIPE", **perimetre))
    assert equipes["groupes"][0]["libelle"] == "Sans équipe" and equipes["groupes"][0]["id"] == 0
    assert _appel(plateforme, jeton, "employes_regrouper", dimension="SERVICE")["isError"] is True


def test_les_departs_d_un_mois_par_motif_et_la_vue_selon_la_paie(
    plateforme: Plateforme,
    admin: tuple[str, str, int],
    creer_utilisateur: Fabrique,
    connecter: Callable[[str, str], dict[str, Any]],
    donnees: Donnees,
) -> None:
    resultat = _donnees(_appel(plateforme, admin[0], "employes_sorties", periode=S2))
    assert (resultat["periode"], resultat["nombre"], resultat["parMotif"]) == (S2, 1, {"STC": 1})
    assert resultat["employes"] == [
        {"id": donnees.employes["C"], "nomPrenom": f"Charlie {donnees.marque}", "motif": "STC"}
    ]
    assert resultat["vue"] == {"module": "employees", "vue": "analytique", "parametres": {"periode": S2}}
    sans_motif = _donnees(_appel(plateforme, admin[0], "employes_sorties", periode="2096-05"))
    assert sans_motif["parMotif"] == {"NON_PRECISE": 1}
    vide = _donnees(_appel(plateforme, admin[0], "employes_sorties", periode="2096-12"))
    assert vide["nombre"] == 0 and vide["employes"] == [] and vide["parMotif"] == {}
    sans_paie = _sans(plateforme, creer_utilisateur, connecter, "PAIE_READ")
    limitee = _donnees(_appel(plateforme, sans_paie, "employes_sorties", periode=S2))
    assert limitee["vue"] == {"module": "employees", "vue": "tabulaire", "parametres": {"statut": "INACTIF"}}
    assert _appel(plateforme, admin[0], "employes_sorties", periode="2096-13")["isError"] is True


def test_le_dernier_mois_de_paie_est_le_defaut_des_outils_a_periode(
    plateforme: Plateforme, admin: tuple[str, str, int], donnees: Donnees
) -> None:
    with plateforme.moteur.connect() as c:
        dernier = c.execute(text("SELECT max(periode) FROM paie")).scalar_one()
    attendu = f"{dernier // 100:04d}-{dernier % 100:02d}"
    assert _donnees(_appel(plateforme, admin[0], "employes_sorties"))["periode"] == attendu
    assert _donnees(_appel(plateforme, admin[0], "paie_indicateurs"))["periode"] == attendu
    assert _donnees(_appel(plateforme, admin[0], "paie_qualite"))["periode"] == attendu
    assert _donnees(_appel(plateforme, admin[0], "paie_bulletins_rechercher"))["periode"] == attendu


def test_le_parcours_deduit_les_evenements_des_bulletins_et_des_departs(
    plateforme: Plateforme, admin: tuple[str, str, int], donnees: Donnees
) -> None:
    b = _donnees(_appel(plateforme, admin[0], "employe_parcours", id=donnees.employes["B"]))
    assert b["indicateurs"] == {
        "moisPayes": 2,
        "totalPercu": 4200.0,
        "joursTravailles": 52.0,
        "premierMois": S1,
        "dernierMois": S2,
    }
    assert [m["periode"] for m in b["mois"]] == [S2, S1]
    assert b["mois"][0]["chantier"] == donnees.codes[1] and b["mois"][0]["fonction"] == donnees.libelles[0]
    assert b["mois"][0]["equipe"] is None and b["mois"][0]["salaireTotal"] == 2200.0
    assert [(e["periode"], e["type"]) for e in b["evenements"]] == [
        (S2, "CHANGEMENT_SALAIRE"),
        (S2, "CHANGEMENT_CHANTIER"),
        (S1, "ENTREE"),
    ]
    assert (b["evenements"][0]["avant"], b["evenements"][0]["apres"]) == ("2000.00", "2200.00")
    assert (b["evenements"][1]["avant"], b["evenements"][1]["apres"]) == (donnees.codes[0], donnees.codes[1])
    assert b["evenements"][2]["apres"] == f"{donnees.codes[0]} · {donnees.libelles[0]}"
    assert b["vue"]["vue"] == "fiche"

    a = _donnees(_appel(plateforme, admin[0], "employe_parcours", id=donnees.employes["A"]))
    assert a["mois"][0]["equipe"] == f"Q{donnees.marque}"

    c = _donnees(_appel(plateforme, admin[0], "employe_parcours", id=donnees.employes["C"]))
    assert [(e["periode"], e["type"], e["motif"]) for e in c["evenements"]] == [
        (S2, "DEPART", "STC"),
        (S1, "ENTREE", None),
    ]

    d = _donnees(_appel(plateforme, admin[0], "employe_parcours", id=donnees.employes["D"]))
    assert [(e["periode"], e["type"]) for e in d["evenements"]] == [
        (S4, "RETOUR"),
        (S4, "CHANGEMENT_SALAIRE"),
        ("2096-03", "DEPART"),
        (S1, "ENTREE"),
    ]
    inconnu = _appel(plateforme, admin[0], "employe_parcours", id=999999999)
    assert inconnu["isError"] is True and "Employé introuvable" in inconnu["content"][0]["text"]


# --- Paie ------------------------------------------------------------------------------------------


def test_les_indicateurs_d_un_mois_et_du_mois_precedent(
    plateforme: Plateforme, admin: tuple[str, str, int], donnees: Donnees
) -> None:
    resultat = _donnees(_appel(plateforme, admin[0], "paie_indicateurs", periode=S2, **_perimetre(donnees)))
    assert resultat["periode"] == S2
    assert resultat["indicateurs"] == {
        "masse": 3300.0,
        "effectif": 2,
        "coutMoyen": 1650.0,
        "nombreChantiers": 2,
        "stc": 0,
        "stcMontant": 0.0,
    }
    assert resultat["moisPrecedent"]["masse"] == 6000.0 and resultat["moisPrecedent"]["effectif"] == 3
    assert [(c["code"], c["masse"], c["effectif"]) for c in resultat["chantiers"]] == [
        (donnees.codes[1], 2200.0, 1),
        (donnees.codes[0], 1100.0, 1),
    ]
    assert resultat["chantiers"][0]["libelle"] == f"Chantier {donnees.codes[1]}"
    assert resultat["vue"]["parametres"]["periode"] == S2
    assert resultat["vue"]["parametres"]["chantierIds"] == ",".join(map(str, donnees.chantiers[:2]))
    non_importe = _donnees(_appel(plateforme, admin[0], "paie_indicateurs", periode="2096-09", **_perimetre(donnees)))
    assert non_importe["indicateurs"]["effectif"] == 0 and non_importe["moisPrecedent"] is None
    assert non_importe["chantiers"] == []
    assert _appel(plateforme, admin[0], "paie_indicateurs", periode="2096-13")["isError"] is True
    assert _appel(plateforme, admin[0], "paie_indicateurs", periode="2096-1")["isError"] is True


def test_les_mois_importes_du_plus_recent_au_plus_ancien(
    plateforme: Plateforme, admin: tuple[str, str, int], donnees: Donnees
) -> None:
    resultat = _donnees(_appel(plateforme, admin[0], "paie_periodes", **_perimetre(donnees)))
    assert resultat["nombreMois"] == 2
    assert [(p["periode"], p["bulletins"], p["chantiers"], p["masse"]) for p in resultat["periodes"]] == [
        (S2, 2, 2, 3300.0),
        (S1, 3, 2, 6000.0),
    ]
    assert resultat["vue"]["vue"] == "cartes"
    vide = _donnees(_appel(plateforme, admin[0], "paie_periodes", chantierIds=[999999999]))
    assert vide["nombreMois"] == 0 and vide["periodes"] == []


def test_la_repartition_se_trie_par_masse_ou_par_critere(
    plateforme: Plateforme, admin: tuple[str, str, int], donnees: Donnees
) -> None:
    jeton, base = admin[0], {"periode": S2, **_perimetre(donnees)}
    par_masse = _donnees(_appel(plateforme, jeton, "paie_repartition", dimension="CHANTIER", **base))
    assert par_masse["periode"] == S2 and par_masse["nombreGroupes"] == 2
    assert [(g["code"], g["masse"]) for g in par_masse["groupes"]] == [
        (donnees.codes[1], 2200.0),
        (donnees.codes[0], 1100.0),
    ]
    croissant = _donnees(_appel(plateforme, jeton, "paie_repartition", dimension="CHANTIER", sens="ASC", **base))
    assert [g["code"] for g in croissant["groupes"]] == [donnees.codes[0], donnees.codes[1]]
    par_code = _donnees(_appel(plateforme, jeton, "paie_repartition", dimension="CHANTIER", tri="CODE", **base))
    assert [g["code"] for g in par_code["groupes"]] == [donnees.codes[0], donnees.codes[1]]
    equipes = _donnees(_appel(plateforme, jeton, "paie_repartition", dimension="EQUIPE", **base))
    assert [(g["code"], g["masse"]) for g in equipes["groupes"]] == [(None, 2200.0), (f"Q{donnees.marque}", 1100.0)]
    fonctions = _donnees(_appel(plateforme, jeton, "paie_repartition", dimension="FONCTION", **base))
    assert [(g["code"], g["libelle"], g["effectif"]) for g in fonctions["groupes"]] == [(None, donnees.libelles[0], 2)]
    assert set(fonctions["groupes"][0]) == {"id", "code", "libelle", "masse", "effectif", "stc", "stcMontant"}
    assert _appel(plateforme, jeton, "paie_repartition", dimension="CHANTIER", tri="INCONNU", **base)["isError"]


def test_l_evolution_est_bornee_au_mois_demande(
    plateforme: Plateforme, admin: tuple[str, str, int], donnees: Donnees
) -> None:
    jusqu_a_m2 = _donnees(_appel(plateforme, admin[0], "paie_evolution", periode=S2, **_perimetre(donnees)))
    assert [(m["periode"], m["masse"], m["effectif"]) for m in jusqu_a_m2["mois"]] == [
        (S1, 6000.0, 3),
        (S2, 3300.0, 2),
    ]
    jusqu_a_m1 = _donnees(_appel(plateforme, admin[0], "paie_evolution", periode=S1, **_perimetre(donnees)))
    assert [m["periode"] for m in jusqu_a_m1["mois"]] == [S1]
    assert set(jusqu_a_m1["mois"][0]) == {"periode", "masse", "effectif", "stc", "stcMontant"}


def test_la_comparaison_rend_variations_statuts_et_extremes(
    plateforme: Plateforme, admin: tuple[str, str, int], donnees: Donnees
) -> None:
    jeton, base = admin[0], {"periode": S2, **_perimetre(donnees)}
    par_fonction = _donnees(_appel(plateforme, jeton, "paie_comparer", dimension="FONCTION", **base))
    assert (par_fonction["periode"], par_fonction["periodeReference"], par_fonction["nombreGroupes"]) == (S2, S1, 1)
    # F1 est payée aux deux mois ; sans autre fonction dans ce périmètre, C (F1) reste comparable
    f1 = par_fonction["groupes"][0]
    assert (f1["statut"], f1["masse"], f1["masseReference"], f1["variationMasse"]) == (
        "COMPARABLE",
        3300.0,
        6000.0,
        -2700.0,
    )
    assert f1["variationPourcentage"] == -45.0 and f1["fonctionPrincipale"] is None
    assert par_fonction["total"] == {
        "masse": 3300.0,
        "masseReference": 6000.0,
        "variationMasse": -2700.0,
        "variationPourcentage": -45.0,
        "effectif": 2,
        "effectifReference": 3,
        "variationEffectif": -1,
        "coutMoyen": 1650.0,
        "coutMoyenReference": 2000.0,
    }
    assert par_fonction["plusForteHausse"] is None and par_fonction["plusForteBaisse"]["id"] == f1["id"]
    assert par_fonction["plusForteBaisseDuPerimetre"] == par_fonction["plusForteBaisse"]
    assert set(par_fonction["definitions"]) >= {"masse", "statut", "plusForteHausseDuPerimetre", "fonctionPrincipale"}

    chantiers = _donnees(
        _appel(
            plateforme,
            jeton,
            "paie_comparer",
            dimension="CHANTIER",
            periodeReference=S1,
            tri="VARIATION_MASSE",
            sens="ASC",
            **base,
        )
    )
    assert [g["code"] for g in chantiers["groupes"]] == [donnees.codes[0], donnees.codes[1]]
    c1, c2 = chantiers["groupes"]
    assert (c1["variationMasse"], c1["variationPourcentage"], c1["variationEffectif"]) == (-1900.0, -63.3, -1)
    assert (c2["variationMasse"], c2["variationPourcentage"]) == (-800.0, -26.7)
    assert c2["fonctionPrincipale"] == {"libelle": donnees.libelles[0], "effectif": 1}
    assert c1["coutMoyen"] == 1100.0 and c1["coutMoyenReference"] == 1500.0


def test_un_groupe_absent_d_un_mois_est_nouveau_ou_disparu_et_classe_en_dernier(
    plateforme: Plateforme, admin: tuple[str, str, int], donnees: Donnees
) -> None:
    # D est payée sur C3 en 2096-01 et en 2096-04 : de 2096-04 à 2096-01, C1 et C2 disparaissent, C3 est comparable
    resultat = _donnees(
        _appel(
            plateforme,
            admin[0],
            "paie_comparer",
            dimension="CHANTIER",
            periode=S4,
            periodeReference=S1,
            chantierIds=donnees.chantiers,
        )
    )
    statuts = {g["code"]: g["statut"] for g in resultat["groupes"]}
    assert statuts == {donnees.codes[2]: "COMPARABLE", donnees.codes[0]: "DISPARU", donnees.codes[1]: "DISPARU"}
    assert resultat["groupes"][0]["code"] == donnees.codes[2] and resultat["groupes"][0]["variationMasse"] == 100.0
    assert resultat["groupes"][0]["variationPourcentage"] == 6.7
    assert all(g["masse"] is None and g["variationMasse"] is None for g in resultat["groupes"][1:])
    assert resultat["plusForteHausse"]["code"] == donnees.codes[2]
    assert resultat["plusForteBaisse"] is None


def test_les_mouvements_mois_par_mois(plateforme: Plateforme, admin: tuple[str, str, int], donnees: Donnees) -> None:
    resultat = _donnees(_appel(plateforme, admin[0], "paie_mouvements", **_perimetre(donnees)))
    premier, second = resultat["mois"]
    assert premier == {
        "periode": S1,
        "effectif": 3,
        "effectifMoisPrecedent": None,
        "variation": None,
        "entrees": None,
        "plusPayes": None,
        "sorties": 0,
        "mutations": None,
    }
    assert second == {
        "periode": S2,
        "effectif": 2,
        "effectifMoisPrecedent": 3,
        "variation": -1,
        "entrees": 0,
        "plusPayes": 1,
        "sorties": 1,
        "mutations": 1,
    }
    assert set(resultat["definitions"]) == set(second) - {"periode"} | set()
    un_mois = _donnees(_appel(plateforme, admin[0], "paie_mouvements", periode=S2, **_perimetre(donnees)))
    assert [m["periode"] for m in un_mois["mois"]] == [S2]
    assert un_mois["vue"]["module"] == "employees" and un_mois["vue"]["parametres"]["periode"] == S2
    absent = _donnees(_appel(plateforme, admin[0], "paie_mouvements", periode="2096-09", **_perimetre(donnees)))
    assert absent["mois"] == []


def test_la_qualite_compte_les_bulletins_sans_equipe_ni_observation(
    plateforme: Plateforme, admin: tuple[str, str, int], donnees: Donnees
) -> None:
    resultat = _donnees(_appel(plateforme, admin[0], "paie_qualite", periode=S2, **_perimetre(donnees)))
    assert (resultat["sansEquipe"], resultat["sansObservation"]) == (1, 2)
    assert len(resultat["tranches"]) == 6 and sum(t["effectif"] for t in resultat["tranches"]) == 2
    assert resultat["tranches"][-1]["max"] is None
    assert resultat["vue"]["vue"] == "tabulaire" and resultat["vue"]["parametres"]["equipeIds"] == "0"


def test_la_recherche_de_bulletins_se_trie_et_se_pagine(
    plateforme: Plateforme, admin: tuple[str, str, int], donnees: Donnees
) -> None:
    jeton, base = admin[0], {"periode": S2, **_perimetre(donnees)}
    par_nom = _donnees(_appel(plateforme, jeton, "paie_bulletins_rechercher", **base))
    assert (par_nom["periode"], par_nom["total"], par_nom["page"]) == (S2, 2, 0)
    a, b = par_nom["bulletins"]
    assert a["employe"] == {
        "id": donnees.employes["A"],
        "nomPrenom": f"Alpha {donnees.marque}",
        "cin": f"CIN{donnees.marque}A",
    }
    assert (a["fonction"], a["chantier"], a["equipe"]) == (donnees.libelles[0], donnees.codes[0], f"Q{donnees.marque}")
    assert (a["joursTravailles"], a["salaireMensuel"], a["salaireTotal"], a["observation"]) == (
        26.0,
        1100.0,
        1100.0,
        None,
    )
    assert b["equipe"] is None and a["primeRoulageOrdinaire"] is None and a["joursRecuperationDimanche"] is None
    classement = _donnees(_appel(plateforme, jeton, "paie_bulletins_rechercher", tri="SALAIRE_TOTAL", limite=1, **base))
    assert [x["salaireTotal"] for x in classement["bulletins"]] == [2200.0] and classement["total"] == 2
    suivante = _donnees(
        _appel(plateforme, jeton, "paie_bulletins_rechercher", tri="SALAIRE_TOTAL", limite=1, page=1, **base)
    )
    assert [x["salaireTotal"] for x in suivante["bulletins"]] == [1100.0] and suivante["page"] == 1
    croissant = _donnees(
        _appel(plateforme, jeton, "paie_bulletins_rechercher", tri="SALAIRE_TOTAL", sens="ASC", **base)
    )
    assert [x["salaireTotal"] for x in croissant["bulletins"]] == [1100.0, 2200.0]
    par_nom_employe = _donnees(
        _appel(plateforme, jeton, "paie_bulletins_rechercher", nom="Bravo " + donnees.marque, periode=S2)
    )
    assert par_nom_employe["total"] == 1 and par_nom_employe["vue"]["parametres"]["nom"] == "Bravo " + donnees.marque
    par_cin = _donnees(_appel(plateforme, jeton, "paie_bulletins_rechercher", cin=f"CIN{donnees.marque}A", periode=S2))
    assert [x["employe"]["id"] for x in par_cin["bulletins"]] == [donnees.employes["A"]]
    vide = _donnees(_appel(plateforme, jeton, "paie_bulletins_rechercher", periode="2096-09", **_perimetre(donnees)))
    assert vide["bulletins"] == [] and vide["total"] == 0
    for arguments in ({"limite": 0}, {"limite": 21}, {"page": -1}, {"tri": "AGE"}):
        assert _appel(plateforme, jeton, "paie_bulletins_rechercher", **arguments)["isError"] is True


def test_le_rapport_est_prepare_sans_fichier_et_exige_l_export(
    plateforme: Plateforme, admin: tuple[str, str, int], donnees: Donnees
) -> None:
    resultat = _donnees(
        _appel(plateforme, admin[0], "rapport_preparer", periode=S2, chantierIds=[donnees.chantiers[0]])
    )
    assert (resultat["periode"], resultat["nombreChantiers"]) == (S2, 1)
    assert resultat["chantiers"] == [
        {
            "id": donnees.chantiers[0],
            "code": donnees.codes[0],
            "libelle": f"Chantier {donnees.codes[0]}",
            "effectif": 1,
            "masse": 1100.0,
        }
    ]
    assert resultat["vue"] == {
        "module": "paie",
        "vue": "tabulaire",
        "parametres": {"chantierIds": str(donnees.chantiers[0]), "periode": S2, "action": "export"},
    }
    vide = _donnees(_appel(plateforme, admin[0], "rapport_preparer", periode="2096-09", chantierIds=donnees.chantiers))
    assert vide["nombreChantiers"] == 0 and vide["chantiers"] == []
    assert _appel(plateforme, admin[0], "rapport_preparer", chantierIds=list(range(1, 52)))["isError"] is True


# --- Accueil ---------------------------------------------------------------------------------------


def test_l_accueil_rend_les_indicateurs_autorises_de_l_utilisateur_courant(
    plateforme: Plateforme,
    admin: tuple[str, str, int],
    creer_utilisateur: Fabrique,
    connecter: Callable[[str, str], dict[str, Any]],
) -> None:
    complet = _donnees(_appel(plateforme, admin[0], "accueil_lire"))
    assert complet["personnalise"] is False and len(complet["indicateurs"]) == 9
    assert [d["code"] for d in complet["disponibles"]] == complet["indicateurs"]
    assert all(d["libelle"] and d["description"] for d in complet["disponibles"])
    sans_paie = _sans(plateforme, creer_utilisateur, connecter, "PAIE_READ")
    limite = _donnees(_appel(plateforme, sans_paie, "accueil_lire"))
    assert limite["indicateurs"] and all(code.startswith("employe.") for code in limite["indicateurs"])


# --- Heures supplémentaires ------------------------------------------------------------------------


def _ligne(plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu) -> dict[str, Any]:
    reponse = plateforme.client.post(
        "/heures-supp",
        headers=entetes,
        json={"employeeId": jeu.employes[0], "periode": MOIS, "chantierId": jeu.chantier, "heuresSupplementaires": 5},
    )
    assert reponse.status_code == 200, reponse.text
    return reponse.json()


def test_les_mois_et_les_indicateurs_d_heures_supplementaires(
    plateforme: Plateforme, admin: tuple[str, str, int], entetes: dict[str, str], jeu: Jeu
) -> None:
    _ligne(plateforme, entetes, jeu)
    periodes = _donnees(_appel(plateforme, admin[0], "heures_supp_periodes"))
    assert periodes["vue"] == {"route": "/heures-supp/analytique", "parametres": {}}
    assert MOIS in periodes["resultats"]["periodes"]
    assert periodes["resultats"]["periodes"] == sorted(periodes["resultats"]["periodes"], reverse=True)

    resultat = _donnees(
        _appel(plateforme, admin[0], "heures_supp_indicateurs", periode=MOIS, chantierIds=[jeu.chantier])
    )
    assert resultat["vue"]["route"] == "/heures-supp/analytique"
    assert resultat["vue"]["parametres"] == {"periode": MOIS, "chantierIds": [jeu.chantier]}
    donnees = resultat["resultats"]
    assert donnees["periode"] == MOIS
    assert (donnees["indicateurs"]["employes"], donnees["indicateurs"]["heures"]) == (1, 5.0)
    assert (donnees["indicateurs"]["montantDh"], donnees["indicateurs"]["netAPayerDh"]) == (50.0, 50.0)
    assert [g["id"] for g in donnees["parChantier"]] == [jeu.chantier]
    assert set(donnees) == {"periode", "indicateurs", "parChantier", "parFonction", "parEquipe", "definitions"}
    assert set(donnees["definitions"]) == {"heures", "montantDh", "stcDh", "forfaitDh", "netAPayerDh"}

    par_cin = _donnees(_appel(plateforme, admin[0], "heures_supp_indicateurs", periode=MOIS, cin="inconnu-xyz"))
    assert par_cin["resultats"]["indicateurs"]["employes"] == 0
    par_defaut = _donnees(_appel(plateforme, admin[0], "heures_supp_indicateurs"))
    assert par_defaut["resultats"]["periode"] == periodes["resultats"]["periodes"][0]
    for arguments in ({"periode": "2098-7"}, {"chantierIds": [0]}, {"fonctionIds": [0]}, {"cin": "x" * 31}):
        assert _appel(plateforme, admin[0], "heures_supp_indicateurs", **arguments)["isError"] is True


def test_la_recherche_de_lignes_exige_un_critere_et_se_pagine(
    plateforme: Plateforme, admin: tuple[str, str, int], entetes: dict[str, str], jeu: Jeu
) -> None:
    _ligne(plateforme, entetes, jeu)
    resultat = _donnees(
        _appel(plateforme, admin[0], "heures_supp_rechercher", periode=MOIS, chantierIds=[jeu.chantier])
    )
    assert resultat["vue"]["route"] == "/heures-supp"
    contenu = resultat["resultats"]
    assert (contenu["total"], contenu["page"], contenu["limite"]) == (1, 0, 20)
    ligne = contenu["content"][0]
    assert ligne["employeeId"] == jeu.employes[0] and ligne["periode"] == MOIS
    assert (ligne["salaireHoraireDh"], ligne["heuresSupplementaires"], ligne["montantDh"]) == (10.0, 5.0, 50.0)
    assert (ligne["stcDh"], ligne["netAPayerDh"]) == (0.0, 50.0)
    page_vide = _donnees(_appel(plateforme, admin[0], "heures_supp_rechercher", periode=MOIS, page=5, limite=1))
    assert page_vide["resultats"]["content"] == [] and page_vide["resultats"]["total"] == 1
    sans_critere = _appel(plateforme, admin[0], "heures_supp_rechercher")
    assert sans_critere["isError"] is True and "au moins un critère" in sans_critere["content"][0]["text"]
    for arguments in ({"periode": MOIS, "limite": 21}, {"periode": MOIS, "limite": 0}, {"periode": MOIS, "page": -1}):
        assert _appel(plateforme, admin[0], "heures_supp_rechercher", **arguments)["isError"] is True


def test_les_prerequis_d_import_verifient_le_mois_et_le_chantier(
    plateforme: Plateforme, admin: tuple[str, str, int], jeu: Jeu
) -> None:
    pret = _donnees(_appel(plateforme, admin[0], "heures_supp_import_prerequis", periode=MOIS, chantierId=jeu.chantier))
    assert pret["vue"] == {"route": "/heures-supp/import", "parametres": {"periode": MOIS, "chantierId": jeu.chantier}}
    prerequis = pret["resultats"]["prerequis"]
    assert prerequis["pret"] is True and prerequis["bulletinsDisponibles"] >= 3 and prerequis["message"] is None
    sans_chantier = _donnees(
        _appel(plateforme, admin[0], "heures_supp_import_prerequis", periode=MOIS, chantierId=999999999)
    )["resultats"]["prerequis"]
    assert sans_chantier["pret"] is False and "chantier" in sans_chantier["message"]
    sans_paie = _donnees(
        _appel(plateforme, admin[0], "heures_supp_import_prerequis", periode="2096-09", chantierId=jeu.chantier)
    )["resultats"]["prerequis"]
    assert sans_paie["pret"] is False and sans_paie["bulletinsDisponibles"] == 0 and sans_paie["message"]
    for arguments in ({"periode": MOIS}, {"chantierId": 1}, {"periode": MOIS, "chantierId": 0}):
        assert _appel(plateforme, admin[0], "heures_supp_import_prerequis", **arguments)["isError"] is True

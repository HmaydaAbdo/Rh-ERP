"""Tri des listes paginées : noms publics de Spring Data (camelCase, chemins imbriqués) envoyés par l'interface Angular.

PostgreSQL réel. Chaque test crée ses données (marque unique) et compare l'ordre réel des lignes à un ordre calculé en
Python : PostgreSQL place les valeurs nulles en dernier en croissant, en premier en décroissant ; à égalité, l'id.
"""

import uuid
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

import pytest
from conftest import ADMIN, Plateforme
from sqlalchemy import text

Ligne = dict[str, Any]

# Colonnes triables réellement utilisées par l'interface (`sortField`, sinon `field`) : ces listes sont recopiées de
#  - frontend/src/app/portail/employee/list/employee-list.component.ts (colonnes, tri par défaut `nomPrenom,asc`),
#    employee-reference.service.ts et cartes-perimetre.component.ts (`nomPrenom,asc`) ;
#  - frontend/src/app/portail/paie/list/paie-list.component.ts (colonnes, tri par défaut `periode,desc`) ;
#  - frontend/src/app/portail/chantier/list/chantier-list.component.ts (colonnes, tri par défaut `code,asc`).
TRIS_ANGULAR: dict[str, list[str]] = {
    "/employees/search": [
        "nomPrenom",
        "cin",
        "fonction.libelle",
        "chantier.code",
        "equipe.libelle",
        "salaire",
        "dateEmbauche",
        "statut",
    ],
    "/paie/search": [
        "employee.nomPrenom",
        "fonction.libelle",
        "employee.cin",
        "nombreJoursTravailles",
        "joursRecuperationOuvrable",
        "joursRecuperationDimanche",
        "salaireMensuel",
        "primeRoulageOrdinaire",
        "primeRoulageDimanche",
        "salaireTotal",
        "observation",
        "chantier.code",
        "chantier.designation",
        "equipe.libelle",
        "periode",
    ],
    "/chantiers/search": ["code", "nom", "designation", "nature", "afficherSurCarte", "sourceErp", "actif"],
}
TRIS_PAR_DEFAUT = {
    "/employees/search": "nomPrenom,asc",
    "/paie/search": "periode,desc",
    "/chantiers/search": "code,asc",
}


def _entetes(connecter: Callable[[str, str], dict[str, Any]]) -> dict[str, str]:
    return {"Authorization": f"Bearer {connecter(*ADMIN)['accessToken']}"}


def _lecteur(plateforme: Plateforme, permissions: set[str]) -> dict[str, str]:
    jeton = plateforme.contexte.emetteur.emettre_acces(1, "lecteur-essai", permissions, set(), timedelta(minutes=5))
    return {"Authorization": f"Bearer {jeton}"}


def attendu(lignes: list[Ligne], cle: str, decroissant: bool) -> list[int]:
    """Rangs dans l'ordre PostgreSQL : nuls en dernier (croissant) ou en premier (décroissant), égalités par id."""
    avec = sorted(
        (ligne for ligne in lignes if ligne[cle] is not None), key=lambda ligne: ligne[cle], reverse=decroissant
    )
    sans = [ligne for ligne in lignes if ligne[cle] is None]
    return [ligne["rang"] for ligne in (sans + avec if decroissant else avec + sans)]


def _rangs(reponse: Any, cle_ligne: Callable[[dict[str, Any]], str], lignes: list[Ligne], cle_rang: str) -> list[int]:
    assert reponse.status_code == 200, reponse.text
    rang_par_valeur = {ligne[cle_rang]: ligne["rang"] for ligne in lignes}
    return [rang_par_valeur[cle_ligne(element)] for element in reponse.json()["content"]]


@dataclass
class Jeu:
    marque: str
    lignes: list[Ligne]


@pytest.fixture
def jeu(plateforme: Plateforme) -> Iterator[Jeu]:
    """Trois employés (et un bulletin chacun) aux valeurs deux à deux différentes ; le rang 1 n'a pas d'équipe."""
    m = uuid.uuid4().hex[:8]
    lignes: list[Ligne] = [
        {
            "nomPrenom": f"Charlie {m}",
            "cin": f"C3{m}",
            "dateEmbauche": date(2024, 3, 1),
            "statut": "ACTIF",
            "salaire": Decimal("3000"),
            "typeSalaire": "MENSUEL",
            "fonction.libelle": f"Fb{m}",
            "chantier.code": f"Cc{m}",
            "chantier.designation": f"Da{m}",
            "equipe.libelle": f"Qa{m}",
            "nombreJoursTravailles": Decimal("20"),
            "joursRecuperationOuvrable": Decimal("1"),
            "joursRecuperationDimanche": Decimal("2"),
            "salaireMensuel": Decimal("300"),
            "primeRoulageOrdinaire": Decimal("5"),
            "primeRoulageDimanche": Decimal("9"),
            "salaireTotal": Decimal("330"),
            "observation": f"c{m}",
            "periode": 209803,
        },
        {
            "nomPrenom": f"Alpha {m}",
            "cin": f"C2{m}",
            "dateEmbauche": date(2024, 1, 1),
            "statut": "INACTIF",
            "salaire": Decimal("1000"),
            "typeSalaire": "JOURNALIER",
            "fonction.libelle": f"Fc{m}",
            "chantier.code": f"Ca{m}",
            "chantier.designation": f"Dc{m}",
            "equipe.libelle": None,
            "nombreJoursTravailles": Decimal("26"),
            "joursRecuperationOuvrable": Decimal("3"),
            "joursRecuperationDimanche": Decimal("1"),
            "salaireMensuel": Decimal("100"),
            "primeRoulageOrdinaire": Decimal("15"),
            "primeRoulageDimanche": Decimal("7"),
            "salaireTotal": Decimal("110"),
            "observation": f"a{m}",
            "periode": 209801,
        },
        {
            "nomPrenom": f"Bravo {m}",
            "cin": f"C1{m}",
            "dateEmbauche": date(2024, 2, 1),
            "statut": "ACTIF",
            "salaire": Decimal("2000"),
            "typeSalaire": "MENSUEL",
            "fonction.libelle": f"Fa{m}",
            "chantier.code": f"Cb{m}",
            "chantier.designation": f"Db{m}",
            "equipe.libelle": f"Qc{m}",
            "nombreJoursTravailles": Decimal("22"),
            "joursRecuperationOuvrable": Decimal("2"),
            "joursRecuperationDimanche": Decimal("3"),
            "salaireMensuel": Decimal("200"),
            "primeRoulageOrdinaire": Decimal("10"),
            "primeRoulageDimanche": Decimal("8"),
            "salaireTotal": Decimal("220"),
            "observation": f"b{m}",
            "periode": 209802,
        },
    ]
    employes: list[int] = []
    fonctions: list[int] = []
    chantiers: list[int] = []
    equipes: list[int] = []
    with plateforme.moteur.begin() as c:
        for rang, ligne in enumerate(lignes):
            ligne["rang"] = rang
            ligne["employee.nomPrenom"] = ligne["nomPrenom"]
            ligne["employee.cin"] = ligne["cin"]
            # Un employé inactif n'a ni chantier ni équipe (`ck_employe_affectations_statut`) ; son bulletin, si.
            ligne["employe.chantier.code"] = ligne["chantier.code"] if ligne["statut"] == "ACTIF" else None
            fonction = c.execute(
                text("INSERT INTO fonction (libelle) VALUES (:l) RETURNING id"), {"l": ligne["fonction.libelle"]}
            ).scalar_one()
            chantier = c.execute(
                text("INSERT INTO chantier (code, designation) VALUES (:c, :d) RETURNING id"),
                {"c": ligne["chantier.code"], "d": ligne["chantier.designation"]},
            ).scalar_one()
            equipe = None
            if ligne["equipe.libelle"]:
                equipe = c.execute(
                    text("INSERT INTO equipe (code, libelle) VALUES (:c, :l) RETURNING id"),
                    {"c": f"E{rang}{m}", "l": ligne["equipe.libelle"]},
                ).scalar_one()
                equipes.append(equipe)
            employe = c.execute(
                text(
                    "INSERT INTO employe (nom_prenom, cin, date_naissance, date_embauche, fonction_id, chantier_id, "
                    "equipe_id, salaire, type_salaire, statut) VALUES (:n, :cin, '1990-01-01', :e, :f, :c, :q, :s, :t, "
                    ":st) RETURNING id"
                ),
                {
                    "n": ligne["nomPrenom"],
                    "cin": ligne["cin"],
                    "e": ligne["dateEmbauche"],
                    "f": fonction,
                    "c": chantier if ligne["statut"] == "ACTIF" else None,
                    "q": equipe if ligne["statut"] == "ACTIF" else None,
                    "s": ligne["salaire"],
                    "t": ligne["typeSalaire"],
                    "st": ligne["statut"],
                },
            ).scalar_one()
            c.execute(
                text(
                    "INSERT INTO paie (employee_id, periode, fonction_id, chantier_id, equipe_id, "
                    "nombre_jours_travailles, jours_recuperation_ouvrable, jours_recuperation_dimanche, "
                    "salaire_mensuel, prime_roulage_ordinaire, prime_roulage_dimanche, salaire_total, observation) "
                    "VALUES (:e, :p, :f, :c, :q, :j, :o, :d, :sm, :po, :pd, :st, :ob)"
                ),
                {
                    "e": employe,
                    "p": ligne["periode"],
                    "f": fonction,
                    "c": chantier,
                    "q": equipe,
                    "j": ligne["nombreJoursTravailles"],
                    "o": ligne["joursRecuperationOuvrable"],
                    "d": ligne["joursRecuperationDimanche"],
                    "sm": ligne["salaireMensuel"],
                    "po": ligne["primeRoulageOrdinaire"],
                    "pd": ligne["primeRoulageDimanche"],
                    "st": ligne["salaireTotal"],
                    "ob": ligne["observation"],
                },
            )
            employes.append(employe)
            fonctions.append(fonction)
            chantiers.append(chantier)
    yield Jeu(m, lignes)
    with plateforme.moteur.begin() as c:
        c.execute(text("DELETE FROM paie WHERE employee_id = ANY(:i)"), {"i": employes})
        c.execute(text("DELETE FROM employe WHERE id = ANY(:i)"), {"i": employes})
        c.execute(text("DELETE FROM equipe WHERE id = ANY(:i)"), {"i": equipes})
        c.execute(text("DELETE FROM chantier WHERE id = ANY(:i)"), {"i": chantiers})
        c.execute(text("DELETE FROM fonction WHERE id = ANY(:i)"), {"i": fonctions})


def _employes(plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu, tri: list[str] | str) -> list[int]:
    reponse = plateforme.client.post(
        "/employees/search", headers=entetes, params={"size": 50, "sort": tri}, json={"nomPrenom": jeu.marque}
    )
    return _rangs(reponse, lambda e: e["cin"], jeu.lignes, "cin")


def _bulletins(plateforme: Plateforme, entetes: dict[str, str], jeu: Jeu, tri: list[str] | str) -> list[int]:
    reponse = plateforme.client.post(
        "/paie/search", headers=entetes, params={"size": 50, "sort": tri}, json={"nomPrenom": jeu.marque}
    )
    return _rangs(reponse, lambda p: p["employee"]["cin"], jeu.lignes, "cin")


@pytest.mark.parametrize("decroissant", [False, True])
@pytest.mark.parametrize("cle", TRIS_ANGULAR["/employees/search"] + ["typeSalaire", "id"])
def test_employes_tries_par_chaque_colonne_de_l_interface(
    plateforme: Plateforme, connecter: Any, jeu: Jeu, cle: str, decroissant: bool
) -> None:
    sens = "desc" if decroissant else "asc"
    rangs = _employes(plateforme, _entetes(connecter), jeu, f"{cle},{sens}")
    cle_python = {"id": "rang", "chantier.code": "employe.chantier.code"}.get(cle, cle)
    assert rangs == attendu(jeu.lignes, cle_python, decroissant)


def test_employes_tri_par_defaut_d_angular_et_tri_multiple(plateforme: Plateforme, connecter: Any, jeu: Jeu) -> None:
    entetes = _entetes(connecter)
    assert _employes(plateforme, entetes, jeu, TRIS_PAR_DEFAUT["/employees/search"]) == [
        1,
        2,
        0,
    ]  # Alpha, Bravo, Charlie
    assert _employes(plateforme, entetes, jeu, ["statut,desc", "nomPrenom,desc"]) == [1, 0, 2]
    sans_tri = plateforme.client.post(
        "/employees/search", headers=entetes, params={"size": 50}, json={"nomPrenom": jeu.marque}
    )
    assert _rangs(sans_tri, lambda e: e["cin"], jeu.lignes, "cin") == [1, 2, 0]  # défaut serveur : nomPrenom


@pytest.mark.parametrize("decroissant", [False, True])
@pytest.mark.parametrize("cle", TRIS_ANGULAR["/paie/search"] + ["id"])
def test_paie_triee_par_chaque_colonne_de_l_interface(
    plateforme: Plateforme, connecter: Any, jeu: Jeu, cle: str, decroissant: bool
) -> None:
    sens = "desc" if decroissant else "asc"
    rangs = _bulletins(plateforme, _entetes(connecter), jeu, f"{cle},{sens}")
    cle_python = "rang" if cle == "id" else cle
    assert rangs == attendu(jeu.lignes, cle_python, decroissant)


def test_paie_tri_par_defaut_d_angular_et_filtre_sur_l_employe_avec_tri_imbrique(
    plateforme: Plateforme, connecter: Any, jeu: Jeu
) -> None:
    entetes = _entetes(connecter)
    assert _bulletins(plateforme, entetes, jeu, TRIS_PAR_DEFAUT["/paie/search"]) == [0, 2, 1]  # période décroissante
    # Le filtre `cin` joint déjà l'employé : le tri sur l'employé ne doit pas entrer en conflit avec cette jointure.
    reponse = plateforme.client.post(
        "/paie/search", headers=entetes, params={"size": 50, "sort": "employee.cin,asc"}, json={"cin": jeu.marque}
    )
    assert _rangs(reponse, lambda p: p["employee"]["cin"], jeu.lignes, "cin") == [2, 1, 0]


def test_chantiers_tries_par_chaque_colonne_de_l_interface(plateforme: Plateforme, connecter: Any) -> None:
    m = uuid.uuid4().hex[:8]
    donnees: list[Ligne] = [
        {"code": f"c{m}", "nom": f"nb{m}", "designation": f"dc{m}", "nature": "DEPOT", "afficherSurCarte": True},
        {"code": f"a{m}", "nom": f"nc{m}", "designation": f"da{m}", "nature": "AO", "afficherSurCarte": False},
        {"code": f"b{m}", "nom": f"na{m}", "designation": f"db{m}", "nature": "EMULSION", "afficherSurCarte": True},
    ]
    donnees[0] |= {"sourceErp": True, "actif": False}
    donnees[1] |= {"sourceErp": False, "actif": True}
    donnees[2] |= {"sourceErp": False, "actif": False}
    with plateforme.moteur.begin() as c:
        for rang, ligne in enumerate(donnees):
            ligne["rang"] = rang
            c.execute(
                text(
                    "INSERT INTO chantier (code, nom, designation, nature, localisation, latitude, longitude, "
                    "afficher_sur_carte, source_erp, actif) "
                    "VALUES (:code, :nom, :designation, :nature, 'Casablanca', 33.5, -7.6, :carte, :erp, :actif)"
                ),
                {
                    "code": ligne["code"],
                    "nom": ligne["nom"],
                    "designation": ligne["designation"],
                    "nature": ligne["nature"],
                    "carte": ligne["afficherSurCarte"],
                    "erp": ligne["sourceErp"],
                    "actif": ligne["actif"],
                },
            )
    try:
        entetes = _entetes(connecter)
        for cle in [*TRIS_ANGULAR["/chantiers/search"], "version"]:
            for decroissant in (False, True):
                sens = "desc" if decroissant else "asc"
                reponse = plateforme.client.post(
                    "/chantiers/search",
                    headers=entetes,
                    params={"size": 50, "sort": f"{cle},{sens}"},
                    json={"recherche": m},
                )
                rangs = _rangs(reponse, lambda ch: ch["code"], donnees, "code")
                if cle == "version":  # toutes les versions valent 0 : égalité, donc ordre des id
                    assert rangs == [0, 1, 2]
                else:
                    assert rangs == attendu(donnees, cle, decroissant), (cle, sens)
        defaut = plateforme.client.post(
            "/chantiers/search",
            headers=entetes,
            params={"size": 50, "sort": TRIS_PAR_DEFAUT["/chantiers/search"]},
            json={"recherche": m},
        )
        assert _rangs(defaut, lambda ch: ch["code"], donnees, "code") == [1, 2, 0]
    finally:
        with plateforme.moteur.begin() as c:
            c.execute(text("DELETE FROM chantier WHERE code LIKE :m"), {"m": f"%{m}"})


@pytest.mark.parametrize(
    ("route", "inconnu"),
    [
        ("/employees/search", "inconnu"),
        ("/employees/search", "nom_prenom"),  # le contrat HTTP est le JSON (camelCase), pas les colonnes Python
        ("/employees/search", "fonction.id"),
        ("/employees/search", "fonction.libelle.x"),
        ("/paie/search", "salaire_total"),
        ("/paie/search", "employee.salaire"),
        ("/paie/search", "motDePasse"),
        ("/chantiers/search", "source_erp"),
        ("/chantiers/search", "localisation"),
    ],
)
def test_tri_sur_un_nom_inconnu_donne_400(plateforme: Plateforme, connecter: Any, route: str, inconnu: str) -> None:
    reponse = plateforme.client.post(route, headers=_entetes(connecter), params={"sort": f"{inconnu},asc"}, json={})
    assert reponse.status_code == 400, reponse.text
    assert inconnu in reponse.json()["message"]


@pytest.mark.parametrize("route", sorted(TRIS_ANGULAR))
def test_contrat_toutes_les_colonnes_triables_d_angular_passent(
    plateforme: Plateforme, connecter: Any, route: str
) -> None:
    entetes = _entetes(connecter)
    tris = [*TRIS_ANGULAR[route], TRIS_PAR_DEFAUT[route].split(",")[0], "nomPrenom"]
    if route != "/employees/search":
        tris.remove("nomPrenom")
    for champ in tris:
        for sens in ("asc", "desc"):
            reponse = plateforme.client.post(
                route, headers=entetes, params={"page": 0, "size": 10, "sort": f"{champ},{sens}"}, json={}
            )
            assert reponse.status_code == 200, (route, champ, sens, reponse.text)
    defaut = plateforme.client.post(
        route, headers=entetes, params={"page": 0, "size": 10, "sort": TRIS_PAR_DEFAUT[route]}, json={}
    )
    assert defaut.status_code == 200, defaut.text


def test_sans_paie_read_les_tris_de_paie_des_employes_sont_retires(
    plateforme: Plateforme, connecter: Any, jeu: Jeu
) -> None:
    """Spring (`EmployeeController.sansTriDePaie`) retire `salaire` et `typeSalaire` du tri, sans erreur."""
    lecteur = _lecteur(plateforme, {"EMPLOYEE_READ"})
    paie = _lecteur(plateforme, {"EMPLOYEE_READ", "PAIE_READ"})
    ordre_par_id = [0, 1, 2]

    for tri in ("salaire,asc", "salaire,desc", "typeSalaire,asc"):
        assert _employes(plateforme, lecteur, jeu, tri) == ordre_par_id, tri
    # Les autres critères du tri multiple restent appliqués ; seul le critère de paie tombe.
    assert _employes(plateforme, lecteur, jeu, ["salaire,desc", "nomPrenom,asc"]) == [1, 2, 0]
    assert _employes(plateforme, lecteur, jeu, ["nomPrenom,asc", "salaire,desc"]) == [1, 2, 0]
    # Un nom inconnu reste une erreur, même pour ce lecteur.
    inconnu = plateforme.client.post("/employees/search", headers=lecteur, params={"sort": "inconnu,asc"}, json={})
    assert inconnu.status_code == 400
    # Avec PAIE_READ, le tri porte bien sur le salaire.
    assert _employes(plateforme, paie, jeu, "salaire,desc") == [0, 2, 1]
    assert _employes(plateforme, paie, jeu, "salaire,asc") == [1, 2, 0]
    assert _employes(plateforme, _entetes(connecter), jeu, "salaire,desc") == [0, 2, 1]

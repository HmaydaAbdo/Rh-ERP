"""Fonctions, équipes, chantiers, employés : création, validations, conflits, recherche (étape 2)."""

from typing import Any

from .harnais import Etape

M = "referentiels"
BASE_CHANTIER = {"nature": "DEPOT", "afficherSurCarte": False}


def _post(nom: str, chemin: str, corps: Any, **kw: Any) -> Etape:
    return Etape(M, nom, "POST", chemin, json=corps, **kw)


def _put(nom: str, chemin: str, corps: Any) -> Etape:
    return Etape(M, nom, "PUT", chemin, json=corps)


def _get(nom: str, chemin: str) -> Etape:
    return Etape(M, nom, "GET", chemin)


def _delete(nom: str, chemin: str) -> Etape:
    return Etape(M, nom, "DELETE", chemin)


def _emp(nom: str, cin: str, f: str, c: str, eq: str | None = None, **plus: Any) -> dict[str, Any]:
    corps: dict[str, Any] = {
        "nomPrenom": nom,
        "cin": cin,
        "dateNaissance": "1990-05-17",
        "dateEmbauche": "2020-01-15",
        "fonctionId": "{" + f + "}",
        "chantierId": "{" + c + "}",
        "equipeId": "{" + eq + "}" if eq else None,
    }
    corps.update(plus)
    return corps


def _fonctions() -> list[Etape]:
    e: list[Etape] = []
    for cle, libelle in [
        ("f_maçon", "Maçon"),
        ("f_chef", "Chef d'équipe"),
        ("f_elec", "  Électricien  "),
        ("f_nul", "Zéro"),
    ]:
        e.append(_post(f"fonction-creer-{cle}", "/functions", {"libelle": libelle}, capture={cle: "id"}))
    return [
        *e,
        _post("fonction-doublon", "/functions", {"libelle": "Maçon"}),
        _post("fonction-doublon-casse", "/functions", {"libelle": "maçon"}),
        _post("fonction-doublon-espaces", "/functions", {"libelle": " Maçon "}),
        _post("fonction-vide", "/functions", {"libelle": "   "}),
        _post("fonction-absente", "/functions", {}),
        _post("fonction-trop-longue", "/functions", {"libelle": "x" * 101}),
        _post("fonction-corps-vide", "/functions", None),
        _get("fonction-lire", "/functions/{f_maçon}"),
        _get("fonction-lire-inconnue", "/functions/999999"),
        _get("fonction-lire-id-invalide", "/functions/abc"),
        _put("fonction-modifier", "/functions/{f_chef}", {"version": 0, "libelle": "Chef d'équipe BTP"}),
        _put("fonction-modifier-version-perimee", "/functions/{f_chef}", {"version": 0, "libelle": "Autre"}),
        _put("fonction-modifier-sans-version", "/functions/{f_chef}", {"libelle": "Autre"}),
        _put("fonction-modifier-inconnue", "/functions/999999", {"version": 0, "libelle": "X"}),
        _post("fonction-recherche", "/functions/search", {}, params={"page": 0, "size": 10}),
        _post("fonction-recherche-tri-libelle", "/functions/search", {}, params={"sort": "libelle,desc"}),
        _post("fonction-recherche-filtre", "/functions/search", {"libelle": "é"}),
        _post("fonction-recherche-joker", "/functions/search", {"libelle": "%"}),
        _post(
            "fonction-recherche-tri-invalide",
            "/functions/search",
            {},
            params={"sort": "inexistant,asc"},
            decide="Décidé : tri inconnu = 400 avec message (Spring 500, défaut de Spring).",
        ),
        _post("fonction-recherche-taille-max", "/functions/search", {}, params={"size": 500}),
        _post("fonction-recherche-page-negative", "/functions/search", {}, params={"page": -1}),
    ]


def _equipes() -> list[Etape]:
    e: list[Etape] = []
    for cle, (code, lib) in {"e_a": ("EQ-A", "Équipe A"), "e_b": ("EQ-B", "Équipe B")}.items():
        e.append(_post(f"equipe-creer-{cle}", "/equipes", {"code": code, "libelle": lib}, capture={cle: "id"}))
    return [
        *e,
        _post("equipe-doublon-code", "/equipes", {"code": "eq-a", "libelle": "Autre"}),
        _post("equipe-doublon-libelle", "/equipes", {"code": "EQ-Z", "libelle": "Équipe A"}),
        _post("equipe-code-long", "/equipes", {"code": "x" * 51, "libelle": "L"}),
        _post("equipe-vide", "/equipes", {"code": "", "libelle": ""}),
        _get("equipe-lire", "/equipes/{e_a}"),
        _put("equipe-modifier", "/equipes/{e_b}", {"version": 0, "code": "EQ-B", "libelle": "Équipe B bis"}),
        _put("equipe-modifier-perimee", "/equipes/{e_b}", {"version": 0, "code": "EQ-B", "libelle": "x"}),
        _post("equipe-recherche", "/equipes/search", {}),
        _post("equipe-recherche-tri-code", "/equipes/search", {}, params={"sort": "code,desc"}),
    ]


def _chantiers() -> list[Etape]:
    b = BASE_CHANTIER
    e: list[Etape] = []
    for cle, code, des in [
        ("c_1", "CH-001", "Chantier Casablanca"),
        ("c_2", " ch-002 ", "Chantier Rabat é"),
        ("c_3", "CH-003", "Chantier Tanger"),
    ]:
        e.append(
            _post(f"chantier-creer-{cle}", "/chantiers", {**b, "code": code, "designation": des}, capture={cle: "id"})
        )
    neuf = {**b, "code": "CH-9", "designation": "d"}
    return [
        *e,
        _post("chantier-doublon", "/chantiers", {**b, "code": "ch-001", "designation": "Dup"}),
        _post("chantier-nature-invalide", "/chantiers", {**neuf, "nature": "ZZZ"}),
        _post("chantier-latitude-hors-borne", "/chantiers", {**neuf, "latitude": 91, "longitude": 1}),
        _post("chantier-carte-sans-coordonnees", "/chantiers", {**neuf, "afficherSurCarte": True}),
        _post("chantier-coordonnees-impaires", "/chantiers", {**neuf, "latitude": 10}),
        _post(
            "chantier-avec-carte",
            "/chantiers",
            {
                "code": "CH-GEO",
                "designation": "Géo",
                "nature": "AO",
                "localisation": "Casablanca",
                "latitude": 33.5731104,
                "longitude": -7.5898434,
                "afficherSurCarte": True,
            },
        ),
        _get("chantier-lire", "/chantiers/{c_1}"),
        _put("chantier-statut-inactif", "/chantiers/{c_3}/statut", {"version": 0, "actif": False}),
        _put("chantier-statut-version-perimee", "/chantiers/{c_3}/statut", {"version": 0, "actif": True}),
        _put(
            "chantier-modifier",
            "/chantiers/{c_1}",
            {**b, "version": 0, "code": "CH-001", "designation": "Chantier Casa 2"},
        ),
        _post("chantier-recherche", "/chantiers/search", {}),
        _post("chantier-recherche-tri-designation", "/chantiers/search", {}, params={"sort": "designation,asc"}),
        _get("chantier-carte", "/chantiers/carte"),
    ]


def _employes() -> list[Etape]:
    e: list[Etape] = []
    for cle, corps in [
        ("emp_1", _emp("Amal Benali", "AB123456", "f_maçon", "c_1", "e_a", salaire=4500, typeSalaire="MENSUEL")),
        ("emp_2", _emp("Omar Éléonore", "CD654321", "f_chef", "c_2", None, salaire=250.5, typeSalaire="JOURNALIER")),
        ("emp_3", _emp("  Nadia  El Fassi ", "EF111111", "f_elec", "c_1", "e_b", dateEmbauche="2026-01-01")),
        ("emp_4", _emp("Salaire Nul", "GH222222", "f_maçon", "c_1", "e_a", salaire=0, typeSalaire="MENSUEL")),
    ]:
        e.append(_post(f"employe-creer-{cle}", "/employees", corps, capture={cle: "id"}))
    m = ("f_maçon", "c_1")
    e += [
        _post("employe-cin-double", "/employees", _emp("Doublon", "ab123456", *m)),
        _post("employe-cin-double-espaces", "/employees", _emp("Doublon", " AB123456 ", *m)),
        _post("employe-salaire-sans-type", "/employees", _emp("S", "ZZ1", *m, salaire=1)),
        _post("employe-naissance-future", "/employees", _emp("S", "ZZ2", *m, dateNaissance="2999-01-01")),
        _post("employe-salaire-negatif", "/employees", _emp("S", "ZZ3", *m, salaire=-1, typeSalaire="MENSUEL")),
        _post("employe-salaire-trop-precis", "/employees", _emp("S", "ZZ4", *m, salaire=1.234, typeSalaire="MENSUEL")),
        _post("employe-fonction-inconnue", "/employees", {**_emp("S", "ZZ5", *m), "fonctionId": 999999}),
        _post("employe-chantier-inactif", "/employees", _emp("S", "ZZ6", "f_maçon", "c_3")),
        _post("employe-date-invalide", "/employees", _emp("S", "ZZ7", *m, dateEmbauche="31/02/2020")),
        _post("employe-sans-nom", "/employees", _emp("", "ZZ8", *m)),
        _get("employe-lire", "/employees/{emp_1}"),
        _put(
            "employe-modifier",
            "/employees/{emp_1}",
            {
                **_emp("Amal Benali", "AB123456", *m, "e_a", salaire=4800, typeSalaire="MENSUEL"),
                "version": 0,
                "statut": "ACTIF",
            },
        ),
        _put(
            "employe-modifier-perimee",
            "/employees/{emp_1}",
            {**_emp("Amal Benali", "AB123456", *m), "version": 0, "statut": "ACTIF"},
        ),
        _put(
            "employe-inactif-sans-chantier",
            "/employees/{emp_4}",
            {
                **_emp("Salaire Nul", "GH222222", *m, salaire=0, typeSalaire="MENSUEL"),
                "chantierId": None,
                "version": 0,
                "statut": "INACTIF",
            },
        ),
        _put(
            "employe-actif-sans-chantier",
            "/employees/{emp_3}",
            {**_emp("Nadia", "EF111111", "f_elec", "c_1"), "chantierId": None, "version": 0, "statut": "ACTIF"},
        ),
        _post("employe-recherche", "/employees/search", {}),
        _post("employe-recherche-nom-accent", "/employees/search", {"nomPrenom": "eleonore"}),
        _post("employe-recherche-cin", "/employees/search", {"cin": "ab"}),
        _post("employe-recherche-sans-equipe", "/employees/search", {"equipeIds": [0]}),
        _post("employe-recherche-statut", "/employees/search", {"statut": "INACTIF"}),
        _post("employe-recherche-fonctions", "/employees/search", {"fonctionIds": ["{f_maçon}"]}),
        _post("employe-recherche-statut-invalide", "/employees/search", {"statut": "X"}),
    ]
    for tri in [
        "nomPrenom,asc", "nomPrenom,desc", "cin,asc", "dateEmbauche,desc", "fonction.libelle,asc",
        "chantier.designation,desc", "equipe.libelle,asc", "salaire,desc", "statut,asc", "id,desc",
    ]:  # fmt: skip
        e.append(_post(f"employe-tri-{tri}", "/employees/search", {}, params={"sort": [tri, "id,asc"]}))
    return e


def _regles() -> list[Etape]:
    return [
        _delete("fonction-supprimer-utilisee", "/functions/{f_maçon}"),
        _delete("equipe-supprimer-utilisee", "/equipes/{e_a}"),
        _delete("chantier-supprimer-utilise", "/chantiers/{c_1}"),
        _delete("fonction-supprimer-libre", "/functions/{f_nul}"),
        _delete("fonction-supprimer-deja-supprimee", "/functions/{f_nul}"),
        _delete("employe-supprimer", "/employees/{emp_4}"),
        _delete("employe-supprimer-inconnu", "/employees/999999"),
    ]


def etapes() -> list[Etape]:
    return _fonctions() + _equipes() + _chantiers() + _employes() + _regles()

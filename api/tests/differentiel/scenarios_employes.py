# pyright: basic
"""Employés, fonctions, équipes, chantiers : analytique, regroupements, imports Excel, masquage de la paie."""

from datetime import date
from io import BytesIO
from typing import Any

from openpyxl import Workbook

from .harnais import MOT_DE_PASSE_TEST, Etape
from .scenarios_paie_import import MIME, _fichier
from .scenarios_referentiels import _chantiers, _employes, _equipes, _fonctions

M = "employes"
CLASSEMENT = {"sort": ["id,asc"], "size": "100"}


def _e(nom: str, methode: str, chemin: str, corps: Any = None, **kw: Any) -> Etape:
    return Etape(M, nom, methode, chemin, json=corps, **kw)


def _classeur(lignes: list[list[Any]]) -> bytes:
    wb = Workbook()
    feuille = wb.active
    assert feuille is not None
    for ligne in lignes:
        feuille.append(ligne)
    sortie = BytesIO()
    wb.save(sortie)
    return sortie.getvalue()


def _import(nom: str, chemin: str, contenu: bytes, fichier: str = "import.xlsx", mime: str = MIME) -> Etape:
    return Etape(M, nom, "POST", chemin, fichiers=_fichier(contenu, fichier, mime))


def _compte(nom: str, role: str) -> Etape:
    corps = {
        "username": nom,
        "email": f"{nom}@example.org",
        "motDePasse": MOT_DE_PASSE_TEST,
        "roleIds": ["{" + role + "}"],
    }
    return _e(f"compte-{nom}", "POST", "/users", corps)


def _comptes() -> list[Etape]:
    lecture = {"p_emp": "code=EMPLOYEE_READ.id", "p_paie": "code=PAIE_READ.id"}
    return [
        _e("permissions", "GET", "/permissions", capture=lecture),
        _e(
            "role-sans-paie",
            "POST",
            "/roles",
            {"nom": "Lecteur Employés", "permissionIds": ["{p_emp}"]},
            capture={"r_sp": "id"},
        ),
        _e(
            "role-avec-paie",
            "POST",
            "/roles",
            {"nom": "Employés et Paie", "permissionIds": ["{p_emp}", "{p_paie}"]},
            capture={"r_ap": "id"},
        ),
        _compte("sanspaie", "r_sp"),
        _compte("avecpaie", "r_ap"),
    ]


def _masquage() -> list[Etape]:
    e: list[Etape] = []
    for qui in ("sanspaie", "avecpaie"):
        for nom, tri in (
            ("recherche", "nomPrenom,asc"),
            ("tri-salaire", "salaire,desc"),
            ("tri-type", "typeSalaire,asc"),
        ):
            e.append(
                _e(f"{qui}-{nom}", "POST", "/employees/search", {}, params={"sort": [tri, "id,asc"]}, utilisateur=qui)
            )
        e += [
            _e(f"{qui}-lire", "GET", "/employees/{emp_1}", utilisateur=qui),
            _e(f"{qui}-analytique", "POST", "/employees/analytique", {}, utilisateur=qui),
            _e(f"{qui}-modifier-sans-droit", "PUT", "/employees/{emp_1}", {}, utilisateur=qui),
        ]
    return e


def _analyses() -> list[Etape]:
    filtres: dict[str, Any] = {
        "tous": {},
        "actifs": {"statut": "ACTIF"},
        "inactifs": {"statut": "INACTIF"},
        "chantier": {"chantierIds": ["{c_1}"]},
        "fonction": {"fonctionIds": ["{f_maçon}"]},
        "sans-equipe": {"equipeIds": [0]},
        "nom": {"nomPrenom": "amal"},
        "aucun": {"cin": "ZZZ"},
        "statut-invalide": {"statut": "X"},
    }
    e = [_e(f"analytique-{n}", "POST", "/employees/analytique", c) for n, c in filtres.items()]
    e.append(_e("analytique-corps-absent", "POST", "/employees/analytique"))
    for dimension in ("CHANTIER", "EQUIPE", "FONCTION", "INCONNUE"):
        p = {"dimension": dimension}
        e.append(_e(f"regroupements-{dimension.lower()}", "POST", "/employees/regroupements", {}, params=p))
    e += [
        _e("regroupements-sans-dimension", "POST", "/employees/regroupements", {}),
        _e(
            "regroupements-filtre",
            "POST",
            "/employees/regroupements",
            {"statut": "ACTIF"},
            params={"dimension": "FONCTION"},
        ),
        _e("regroupements-corps-absent", "POST", "/employees/regroupements", params={"dimension": "CHANTIER"}),
        _e("recherche-corps-absent", "POST", "/employees/search", params=CLASSEMENT),
        _e("recherche-taille-enorme", "POST", "/employees/search", {}, params={"size": "5000", "sort": ["id,asc"]}),
        _e("fonctions-recherche-corps-absent", "POST", "/functions/search", params=CLASSEMENT),
        _e("equipes-recherche-corps-absent", "POST", "/equipes/search", params=CLASSEMENT),
        _e("chantiers-recherche-corps-absent", "POST", "/chantiers/search", params=CLASSEMENT),
        _e("chantiers-recherche-actif", "POST", "/chantiers/search", {"actif": True}, params=CLASSEMENT),
        _e("chantiers-sync", "POST", "/chantiers/sync"),
    ]
    return e


def _imports_employes() -> list[Etape]:
    h = ["Date d'embauche", "Nom & prénom", "CIN", "Fonction", "Chantier", "Date de naissance"]

    def ligne(
        cin: str,
        nom: str = "Import",
        fonction: str = "Maçon",
        chantier: str = "CH1",
        naissance: str | date = "1990-01-01",
    ):
        return ["2024-01-15", nom, cin, fonction, chantier, naissance]

    chemin = "/employees/import"
    return [
        _import("employes-import-ok", chemin, _classeur([h, ligne("IM0001")])),
        _import("employes-import-meme-cin", chemin, _classeur([h, ligne("IM0001")])),
        _import(
            "employes-import-atomique", chemin, _classeur([h, ligne("IM0002"), ligne("IM0003", fonction="Inconnue")])
        ),
        _e("employes-import-apres-rejet", "POST", "/employees/search", {}, params=CLASSEMENT),
        _import("employes-import-doublon-interne", chemin, _classeur([h, ligne("IM0004"), ligne("im0004")])),
        _import("employes-import-chantier-clos", chemin, _classeur([h, ligne("IM0005", chantier="CH3")])),
        _import(
            "employes-import-naissance-future", chemin, _classeur([h, ligne("IM0006", naissance=date(2999, 1, 1))])
        ),
        _import("employes-import-dates-en-texte", chemin, _classeur([h, ligne("IM0008", naissance="1990-01-01")])),
        _import("employes-import-ligne-vide-au-milieu", chemin, _classeur([h, ligne("IM0009"), [], ligne("IM0010")])),
        _import("employes-import-nombre-trop-long", chemin, _classeur([h, ligne("C" * 31)])),
        _import("employes-import-champ-manquant", chemin, _classeur([h, ligne("IM0007", nom="")])),
        _import("employes-import-colonnes-insuffisantes", chemin, _classeur([["A", "B"], ["1", "2"]])),
        _import("employes-import-vide", chemin, _classeur([])),
        _import("employes-import-entete-seul", chemin, _classeur([h])),
        _import("employes-import-pas-un-classeur", chemin, b"ceci n'est pas un classeur"),
        _import("employes-import-csv", chemin, b"a;b\n1;2\n", "x.csv", "text/csv"),
        Etape(M, "employes-import-sans-fichier", "POST", chemin),
        _import("employes-import-21-mo", chemin, b"0" * (21 * 1024 * 1024), "gros.xlsx"),
    ]


def _imports_referentiels() -> list[Etape]:
    f, q = "/functions/import", "/equipes/import"
    return [
        _import("fonctions-import-ok", f, _classeur([["Fonction"], ["Soudeur"], ["Plombier"]])),
        _import("fonctions-import-doublon-base", f, _classeur([["Fonction"], ["Soudeur"], ["Nouvelle"]])),
        _import("fonctions-import-doublon-interne", f, _classeur([["Fonction"], ["Peintre"], ["peintre"]])),
        _import("fonctions-import-vide", f, _classeur([])),
        _import("fonctions-import-pas-un-classeur", f, b"nope"),
        _e("fonctions-apres-import", "POST", "/functions/search", {}, params=CLASSEMENT),
        _import(
            "equipes-import-ok", q, _classeur([["Code", "Libellé"], ["IMP1", "Import Un"], ["IMP2", "Import Deux"]])
        ),
        _import(
            "equipes-import-doublon-base", q, _classeur([["Code", "Libellé"], ["IMP1", "Autre"], ["IMP3", "Trois"]])
        ),
        _import("equipes-import-code-long", q, _classeur([["Code", "Libellé"], ["X" * 51, "Long"]])),
        _import("equipes-import-vide", q, _classeur([])),
        _import("equipes-import-pas-un-classeur", q, b"nope"),
        _e("equipes-apres-import", "POST", "/equipes/search", {}, params=CLASSEMENT),
    ]


def etapes() -> list[Etape]:
    base = [*_fonctions(), *_equipes(), *_chantiers(), *_employes()]
    toutes = [*base, *_comptes(), *_masquage(), *_analyses(), *_imports_employes(), *_imports_referentiels()]
    questions = {
        "pas-un-classeur": "Décidé : message français unique, indépendant de la bibliothèque Excel.",
        "csv": "Décidé : message français unique, indépendant de la bibliothèque Excel.",
        "sans-fichier": "Décidé : fichier absent = 400 (Spring 500, défaut de Spring).",
        "21-mo": "Décidé : au-delà de 20 Mo, 413 avec message (Spring coupe la connexion).",
    }
    for e in toutes:
        e.module = M
        e.trier_listes = e.chemin.startswith(("/roles", "/users"))
        e.decide = next((q for cle, q in questions.items() if e.nom.endswith(cle)), e.decide)
        if e.nom.endswith("modifier-sans-droit"):
            e.decide = "Spring valide le corps avant les droits (400) ; Python refuse d'abord (403)."
    return toutes

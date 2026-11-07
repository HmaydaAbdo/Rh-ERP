"""Heures supplémentaires : import par chantier, recherche, analytique et rapport PDF."""

from io import BytesIO
from typing import Any

from openpyxl import Workbook

from .harnais import Etape
from .scenarios_paie_import import MIME, _fichier, _post
from .scenarios_paie_sorties import _donnees

M = "heures-supp"
IMPORT = "/heures-supp/import"


def classeur_hs(lignes: list[list[Any]], entete: tuple[str, str, str] = ("Nom et prénom", "CIN", "HS")) -> bytes:
    wb = Workbook()
    feuille = wb.active
    assert feuille is not None
    feuille.append(list(entete))
    for ligne in lignes:
        feuille.append(ligne)
    sortie = BytesIO()
    wb.save(sortie)
    return sortie.getvalue()


def _import(nom: str, chemin: str, contenu: bytes, periode: str, chantier: str, **kw: Any) -> Etape:
    return _post(
        nom,
        chemin,
        fichiers=_fichier(contenu, "hs.xlsx", MIME),
        params={"periode": periode, "chantierId": "{" + chantier + "}"},
        **kw,
    )


def _imports() -> list[Etape]:
    ca_janvier = classeur_hs([["Amal Benali", "AB1001", 12.5], ["Éléonore Müller", "EF1003", 8]])
    cb_janvier = classeur_hs([["Omar Jour", "CD1002", 5.5], ["Stc Mois Deux", "KL1006", 3]])
    ca_fevrier = classeur_hs([["Amal Benali", "AB1001", 10], ["Éléonore Müller", "EF1003", 0]])
    return [
        Etape(M, "prerequis-ch-a", "GET", f"{IMPORT}/prerequis", params={"periode": "2026-01", "chantierId": "{c_a}"}),
        _import("analyse-ch-a-janvier", f"{IMPORT}/analyse", ca_janvier, "2026-01", "c_a"),
        _post(
            "analyse-ch-a-janvier-en-formulaire",
            f"{IMPORT}/analyse",
            fichiers=_fichier(ca_janvier, "hs.xlsx", MIME),
            donnees={"periode": "2026-01", "chantierId": "{c_a}"},
            question="Spring lit periode et chantierId en query ou en formulaire ; Python en query seulement.",
        ),
        _import("import-ch-a-janvier", IMPORT, ca_janvier, "2026-01", "c_a"),
        _import("import-ch-a-janvier-doublon", IMPORT, ca_janvier, "2026-01", "c_a"),
        _import("import-ch-b-janvier", IMPORT, cb_janvier, "2026-01", "c_b"),
        _import("remplacement-ch-a-fevrier", f"{IMPORT}/remplacement", ca_fevrier, "2026-02", "c_a"),
        _import("import-ch-a-fevrier", IMPORT, ca_fevrier, "2026-02", "c_a"),
    ]


def _lectures() -> list[Etape]:
    return [
        _post("recherche-tout", "/heures-supp/search", json={}, params={"sort": "id,asc"}),
        _post("recherche-janvier", "/heures-supp/search", json={"periode": "2026-01"}, params={"sort": "id,asc"}),
        Etape(M, "periodes", "GET", "/heures-supp/periodes"),
        _post("analytique-janvier", "/heures-supp/analytique", json={"periode": "2026-01"}),
        _post("analytique-vide", "/heures-supp/analytique", json={}),
    ]


def _sorties_pdf() -> list[Etape]:
    return [
        _post("pdf-janvier", "/heures-supp/export/pdf", json={"periode": "2026-01"}),
        _post("pdf-plusieurs-mois", "/heures-supp/export/pdf", json={"periodes": ["2026-01", "2026-02"]}),
        _post("pdf-tous-les-mois", "/heures-supp/export/pdf", json={}),
        _post("pdf-trie-par-heures", "/heures-supp/export/pdf", json={"periode": "2026-01", "tri": "heures,desc"}),
        _post("pdf-recherche-nom", "/heures-supp/export/pdf", json={"periode": "2026-01", "nomPrenom": "amal"}),
        _post("pdf-filtre-chantier", "/heures-supp/export/pdf", json={"periode": "2026-01", "chantierIds": ["{c_b}"]}),
        _post("pdf-aucune-ligne", "/heures-supp/export/pdf", json={"periode": "2025-06"}),
        _post("pdf-periode-invalide", "/heures-supp/export/pdf", json={"periode": "2026-13"}),
        _post("pdf-sans-authentification", "/heures-supp/export/pdf", json={}, jeton=False),
    ]


def etapes() -> list[Etape]:
    toutes = [*_donnees(), *_imports(), *_lectures(), *_sorties_pdf()]
    for e in toutes:
        e.module = M
    return toutes

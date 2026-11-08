# pyright: basic
"""Lectures et écritures unitaires de la paie : recherche (tris, filtres), KPI, effectifs, parcours, options, CRUD."""

from typing import Any

from .harnais import Etape
from .scenarios_paie_sorties import _donnees

M = "paie-lectures"
TRIS = (
    "id", "version", "periode", "nombreJoursTravailles", "joursRecuperationOuvrable", "joursRecuperationDimanche",
    "salaireMensuel", "primeRoulageOrdinaire", "primeRoulageDimanche", "salaireTotal", "observation",
    "employee.nomPrenom", "employee.cin", "fonction.libelle", "chantier.code", "chantier.nom",
    "chantier.designation", "equipe.code", "equipe.libelle",
)  # fmt: skip


def _post(nom: str, chemin: str, corps: Any = None, **kw: Any) -> Etape:
    return Etape(M, nom, "POST", chemin, json=corps, **kw)


def _get(nom: str, chemin: str, **kw: Any) -> Etape:
    return Etape(M, nom, "GET", chemin, **kw)


def _recherches() -> list[Etape]:
    e = [
        _post(f"recherche-tri-{t}", "/paie/search", {"periode": "2026-01"}, params={"sort": [f"{t},desc", "id,asc"]})
        for t in TRIS
    ]
    filtres: dict[str, dict[str, Any]] = {
        "sans-filtre": {},
        "periode": {"periode": "2026-02"},
        "cin": {"cin": "ab10"},
        "nom": {"nomPrenom": "éléo"},
        "nom-casse": {"nomPrenom": "MULLER"},
        "employe": {"employeeId": "{emp7}"},
        "fonction": {"fonctionIds": ["{f_m}"]},
        "chantier": {"chantierIds": ["{c_b}"]},
        "chantiers-multiples": {"chantierIds": ["{c_a}", "{c_b}", "{c_168}"]},
        "equipe": {"equipeIds": ["{e_ch}"]},
        "combine": {"periode": "2026-01", "chantierIds": ["{c_168}"], "fonctionIds": ["{f_m}"]},
        "aucun": {"cin": "ZZZ"},
        "periode-invalide": {"periode": "2026-13"},
        "cin-trop-long": {"cin": "x" * 31},
    }
    e += [_post(f"recherche-{n}", "/paie/search", c) for n, c in filtres.items()]
    e += [
        _post("recherche-corps-absent", "/paie/search"),
        _post("recherche-page-2", "/paie/search", {}, params={"page": "1", "size": "3", "sort": "id,asc"}),
        _post("recherche-taille-zero", "/paie/search", {}, params={"size": "0"}),
        _post("recherche-taille-enorme", "/paie/search", {}, params={"size": "5000"}),
        _post("recherche-page-negative", "/paie/search", {}, params={"page": "-1"}),
        _post(
            "recherche-tri-inconnu",
            "/paie/search",
            {},
            params={"sort": "nope,asc"},
            decide="Décidé : tri inconnu = 400 avec message (Spring 500, défaut de Spring).",
        ),
        _post(
            "recherche-tri-sens-invalide",
            "/paie/search",
            {},
            params={"sort": "id,up"},
            decide="Décidé : tri inconnu = 400 avec message (Spring 500, défaut de Spring).",
        ),
        _post("recherche-sans-authentification", "/paie/search", {}, jeton=False),
    ]
    return e


def _agregats() -> list[Etape]:
    e = [
        _get("periodes", "/paie/periodes"),
        _post("periodes-recherche", "/paie/periodes/search", {"chantierIds": ["{c_b}"]}),
        _post("periodes-recherche-corps-absent", "/paie/periodes/search"),
        _post("chantiers-recherche", "/paie/chantiers/search", {"periode": "2026-01"}),
        _post("chantiers-recherche-mois-2", "/paie/chantiers/search", {"periode": "2026-02"}),
        _post("chantiers-recherche-sans-periode", "/paie/chantiers/search", {}),
        _get("chantiers-par-periode", "/paie/chantiers", params={"periode": "2026-01"}),
        _get("chantiers-periode-absente", "/paie/chantiers"),
        _get("chantiers-periode-invalide", "/paie/chantiers", params={"periode": "2026-13"}),
        _get("materiel", "/paie/materiel"),
        _post("analytique-janvier", "/paie/analytique", {"periode": "2026-01"}, trier_listes=True),
        _post("analytique-fevrier", "/paie/analytique", {"periode": "2026-02"}, trier_listes=True),
        _post("analytique-chantier", "/paie/analytique", {"periode": "2026-01", "chantierIds": ["{c_b}"]}),
        _post("analytique-vide", "/paie/analytique", {}),
        _post("analytique-mois-sans-paie", "/paie/analytique", {"periode": "2026-05"}),
        _post("effectifs", "/paie/effectifs", {}),
        _post("effectifs-chantier", "/paie/effectifs", {"chantierIds": ["{c_a}"]}),
        _post("effectifs-corps-absent", "/paie/effectifs"),
        _get("parcours-employe", "/paie/employes/{emp7}/parcours"),
        _get("parcours-employe-sorti", "/paie/employes/{emp5}/parcours"),
        _get("parcours-inconnu", "/paie/employes/999999/parcours"),
        _get("parcours-id-texte", "/paie/employes/abc/parcours"),
    ]
    options = [
        ("chantiers", {"periode": "2026-01"}),
        ("chantiers-recherche", {"periode": "2026-01", "recherche": "b"}),
        ("chantiers-periode-absente", {}),
        ("chantiers-recherche-longue", {"periode": "2026-01", "recherche": "x" * 101}),
    ]
    e += [_post(f"options-{n}", "/paie/options/chantiers", c) for n, c in options]
    e += [
        _post("options-chantiers-page", "/paie/options/chantiers", {"periode": "2026-01"}, params={"size": "1"}),
        _post("options-chantiers-tri-inconnu", "/paie/options/chantiers", {"periode": "2026-01"}, params={"sort": "x"}),
        _post("options-equipes", "/paie/options/equipes", {"periode": "2026-01", "chantierIds": ["{c_a}"]}),
        _post(
            "options-equipes-recherche",
            "/paie/options/equipes",
            {"periode": "2026-01", "chantierIds": ["{c_168}"], "recherche": "ch"},
        ),
        _post("options-equipes-sans-chantier", "/paie/options/equipes", {"periode": "2026-01", "chantierIds": []}),
        _post("options-equipes-absent", "/paie/options/equipes", {"periode": "2026-01"}),
    ]
    return e


def _crud() -> list[Etape]:
    base = {
        "employeeId": "{emp7}",
        "periode": "2026-03",
        "fonctionId": "{f_m}",
        "chantierId": "{c_168}",
        "equipeId": "{e_ch}",
        "nombreJoursTravailles": 20,
        "salaireMensuel": 3500,
        "salaireTotal": 3500,
    }
    return [
        _post("creer", "/paie", base, capture={"p_new": "id"}),
        _post("creer-doublon", "/paie", base),
        _post("creer-employe-inconnu", "/paie", {**base, "employeeId": 999999}),
        _post("creer-jours-negatifs", "/paie", {**base, "periode": "2026-04", "nombreJoursTravailles": -1}),
        _post("creer-salaire-trop-precis", "/paie", {**base, "periode": "2026-04", "salaireMensuel": 1.234}),
        _post("creer-sans-periode", "/paie", {k: v for k, v in base.items() if k != "periode"}),
        _post("creer-periode-invalide", "/paie", {**base, "periode": "2026-13"}),
        _post("creer-observation-longue", "/paie", {**base, "periode": "2026-04", "observation": "x" * 256}),
        _get("lire", "/paie/{p_new}"),
        _get("lire-inconnue", "/paie/999999"),
        Etape(
            M,
            "modifier",
            "PUT",
            "/paie/{p_new}",
            json={
                **{k: v for k, v in base.items() if k not in ("employeeId", "periode")},
                "salaireTotal": 3600,
                "version": 0,
            },
        ),
        Etape(
            M,
            "modifier-version-perimee",
            "PUT",
            "/paie/{p_new}",
            json={
                **{k: v for k, v in base.items() if k not in ("employeeId", "periode")},
                "salaireTotal": 3700,
                "version": 0,
            },
        ),
        Etape(
            M,
            "modifier-sans-version",
            "PUT",
            "/paie/{p_new}",
            json={k: v for k, v in base.items() if k not in ("employeeId", "periode")},
        ),
        Etape(
            M,
            "modifier-inconnue",
            "PUT",
            "/paie/999999",
            json={**{k: v for k, v in base.items() if k not in ("employeeId", "periode")}, "version": 0},
        ),
        Etape(M, "supprimer", "DELETE", "/paie/{p_new}"),
        Etape(M, "supprimer-deja-supprimee", "DELETE", "/paie/{p_new}"),
        _post(
            "suppression-groupe-compte-faux",
            "/paie/suppression",
            {"criteres": {"periode": "2026-02"}, "nombreAttendu": 1},
        ),
        _post("suppression-groupe", "/paie/suppression", {"criteres": {"periode": "2026-02"}, "nombreAttendu": 7}),
        _get("periodes-apres-suppression", "/paie/periodes"),
        _post("suppression-groupe-vide", "/paie/suppression", {"criteres": {"periode": "2026-02"}, "nombreAttendu": 0}),
        _post("suppression-groupe-sans-corps", "/paie/suppression"),
    ]


def etapes() -> list[Etape]:
    toutes = [*_donnees(), *_recherches(), *_agregats(), *_crud()]
    for e in toutes:
        e.module = M
    return toutes

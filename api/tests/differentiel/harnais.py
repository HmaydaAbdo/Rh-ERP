"""Harnais différentiel : rejoue la même séquence de requêtes sur Spring (référence) et sur l'API Python.

Spring (tag java-final) est la RÉFÉRENCE : tout écart est un bug Python, sauf écart accepté par le propriétaire
(liste ECARTS_ACCEPTES de ``scenarios``). Compare le statut, les en-têtes utiles, le JSON clé par clé et les
classeurs Excel cellule par cellule. Les ids générés, horodatages et jetons sont normalisés (voir ``normaliser``).

Lancement (banc démarré, voir README.md) :  uv run python -m tests.differentiel.run [module ...]
"""

from __future__ import annotations

import io
import json
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import httpx
from openpyxl import load_workbook

URLS = {"spring": "http://127.0.0.1:8081", "python": "http://127.0.0.1:8082"}
IDENTIFIANTS = {"username": "ci-admin", "password": "Diff-Admin-Pwd-2026!"}
EN_TETES_UTILES = ("content-disposition", "content-type", "cache-control", "x-content-type-options")
CLES_HORODATAGE = re.compile(
    r"(createdat|updatedat|horodatage|timestamp|datecreation|datemodification|expires|exp|iat)", re.I
)
CLES_ID = re.compile(r"(^rev$|^token$|accesstoken|requestid|traceid)", re.I)  # les ids métier se comparent bruts


@dataclass
class Etape:
    """Une requête rejouée à l'identique sur les deux backends."""

    module: str
    nom: str
    methode: str
    chemin: str
    json: Any = None
    params: dict[str, Any] | None = None
    fichiers: dict[str, tuple[str, bytes, str]] | None = None  # champ -> (nom, contenu, type MIME)
    donnees: dict[str, Any] | None = None
    parties_json: dict[str, Any] | None = None  # parties multipart application/json (@RequestPart)
    jeton: bool = True
    capture: dict[str, str] | None = None  # nom -> chemin pointé dans la réponse JSON, ré-injecté en {nom}
    trier_listes: bool = False  # ordre non spécifié : compare les listes comme des ensembles
    ignorer: tuple[str, ...] = ()  # chemins pointés exclus (écart accepté documenté)
    en_tetes: dict[str, str] | None = None
    question: str | None = (
        None  # écart connu soumis au propriétaire : classé « à valider », jamais « corrigé » en silence
    )


@dataclass
class Reponse:
    statut: int
    en_tetes: dict[str, str]
    json: Any
    octets: bytes


ANGLAIS_VALIDATION = re.compile(r"must not be|must be|size must|numeric value out of bounds")


@dataclass
class Ecart:
    etape: str
    objet: str
    spring: Any
    python: Any
    categorie: str = "ecart"  # "ecart" = bug Python à corriger ; "a_valider" = décision du propriétaire attendue


@dataclass
class Rapport:
    etapes: int = 0
    identiques: int = 0
    ecarts: list[Ecart] = field(default_factory=list)
    par_module: dict[str, list[int]] = field(default_factory=dict)  # module -> [comparées, identiques]


class Backend:
    def __init__(self, nom: str):
        self.nom = nom
        self.client = httpx.Client(base_url=URLS[nom], timeout=60.0)
        self.jeton: str | None = None
        self.captures: dict[str, Any] = {}

    def connecter(self) -> None:
        r = self.client.post("/auth/login", json=IDENTIFIANTS)
        r.raise_for_status()
        self.jeton = r.json()["accessToken"]

    def executer(self, e: Etape) -> Reponse:
        chemin = e.chemin.format(**self.captures)
        en_tetes = dict(e.en_tetes or {})
        if e.jeton and self.jeton:
            en_tetes["Authorization"] = f"Bearer {self.jeton}"
        kwargs: dict[str, Any] = {"headers": en_tetes, "params": e.params}
        if e.fichiers or e.parties_json:
            fichiers = dict(e.fichiers or {})
            for nom, valeur in (e.parties_json or {}).items():
                fichiers[nom] = (nom, json.dumps(valeur).encode(), "application/json")
            kwargs["files"] = fichiers
            kwargs["data"] = e.donnees
        elif e.json is not None:
            kwargs["json"] = _formater(e.json, self.captures)
        elif e.donnees:
            kwargs["data"] = e.donnees
        r = self.client.request(e.methode, chemin, **kwargs)
        corps = None
        if "json" in r.headers.get("content-type", ""):
            try:
                corps = r.json()
            except ValueError:
                corps = None
        rep = Reponse(r.status_code, {k.lower(): v for k, v in r.headers.items()}, corps, r.content)
        for nom, chemin_json in (e.capture or {}).items():
            self.captures[nom] = _extraire(corps, chemin_json)
        return rep


def _formater(valeur: Any, captures: dict[str, Any]) -> Any:
    if isinstance(valeur, str):
        if re.fullmatch(r"\{\w+\}", valeur) and valeur[1:-1] in captures:
            return captures[valeur[1:-1]]  # valeur brute (entier) et non sa représentation texte
        return valeur.format(**captures) if "{" in valeur else valeur
    if isinstance(valeur, dict):
        return {k: _formater(v, captures) for k, v in valeur.items()}
    if isinstance(valeur, list):
        return [_formater(v, captures) for v in valeur]
    return valeur


def _extraire(corps: Any, chemin: str) -> Any:
    courant = corps
    for morceau in chemin.split("."):
        courant = courant[int(morceau)] if isinstance(courant, list) else courant[morceau]
    return courant


def normaliser(valeur: Any, ids: dict[Any, str], cle: str = "") -> Any:
    """Remplace ids générés (numérotés par ordre d'apparition, pour garder la cohérence), horodatages et jetons."""
    if isinstance(valeur, dict):
        return {k: normaliser(v, ids, k) for k, v in valeur.items()}
    if isinstance(valeur, list):
        return [normaliser(v, ids, cle) for v in valeur]
    if valeur is not None and CLES_HORODATAGE.search(cle):
        return "<horodatage>"
    if valeur is not None and CLES_ID.search(cle) and not isinstance(valeur, bool):
        return ids.setdefault(valeur, f"<id{len(ids) + 1}>")
    return valeur


def _comparer_json(a: Any, b: Any, chemin: str, sortie: list[tuple[str, Any, Any]], trier: bool) -> None:
    if isinstance(a, dict) and isinstance(b, dict):
        for cle in sorted(set(a) | set(b)):
            if cle not in a:
                sortie.append((f"{chemin}.{cle}", "<absent>", b[cle]))
            elif cle not in b:
                sortie.append((f"{chemin}.{cle}", a[cle], "<absent>"))
            else:
                _comparer_json(a[cle], b[cle], f"{chemin}.{cle}", sortie, trier)
    elif isinstance(a, list) and isinstance(b, list):
        if trier:
            a = sorted(a, key=lambda x: json.dumps(x, sort_keys=True, ensure_ascii=False))
            b = sorted(b, key=lambda x: json.dumps(x, sort_keys=True, ensure_ascii=False))
        if len(a) != len(b):
            sortie.append((f"{chemin}.length", len(a), len(b)))
        for i, (x, y) in enumerate(zip(a, b, strict=False)):
            _comparer_json(x, y, f"{chemin}[{i}]", sortie, trier)
    elif a != b and not (
        isinstance(a, int | float) and isinstance(b, int | float) and not isinstance(a, bool) and abs(a - b) < 1e-9
    ):
        sortie.append((chemin, a, b))


def comparer_excel(a: bytes, b: bytes) -> list[tuple[str, Any, Any]]:
    """Cellule par cellule : valeurs, types, formats, largeurs, noms de feuilles, fusions."""
    sortie: list[tuple[str, Any, Any]] = []
    wa, wb = load_workbook(io.BytesIO(a)), load_workbook(io.BytesIO(b))
    if wa.sheetnames != wb.sheetnames:
        sortie.append(("feuilles", wa.sheetnames, wb.sheetnames))
    for nom in [n for n in wa.sheetnames if n in wb.sheetnames]:
        sa, sb = wa[nom], wb[nom]
        if sa.dimensions != sb.dimensions:
            sortie.append((f"{nom}!dimensions", sa.dimensions, sb.dimensions))
        if sorted(map(str, sa.merged_cells.ranges)) != sorted(map(str, sb.merged_cells.ranges)):
            sortie.append(
                (f"{nom}!fusions", sorted(map(str, sa.merged_cells.ranges)), sorted(map(str, sb.merged_cells.ranges)))
            )
        largeurs_a = {k: round(d.width or 0, 1) for k, d in sa.column_dimensions.items() if d.width}
        largeurs_b = {k: round(d.width or 0, 1) for k, d in sb.column_dimensions.items() if d.width}
        if largeurs_a != largeurs_b:
            sortie.append((f"{nom}!largeurs", largeurs_a, largeurs_b))
        for ligne in range(1, max(sa.max_row, sb.max_row) + 1):
            for col in range(1, max(sa.max_column, sb.max_column) + 1):
                ca, cb = sa.cell(ligne, col), sb.cell(ligne, col)
                ref = f"{nom}!{ca.coordinate}"
                if ca.value != cb.value:
                    sortie.append((f"{ref}.valeur", ca.value, cb.value))
                elif type(ca.value) is not type(cb.value):
                    sortie.append((f"{ref}.type", type(ca.value).__name__, type(cb.value).__name__))
                if ca.number_format != cb.number_format:
                    sortie.append((f"{ref}.format", ca.number_format, cb.number_format))
    return sortie


def _ordre_libre(e: Etape) -> bool:
    """Spring ne trie pas une recherche sans `sort` (ordre physique, non spécifié) : comparée comme un ensemble."""
    return e.chemin.endswith("/search") and not (e.params or {}).get("sort")


def _categorie(e: Etape, objet: str, spring: Any) -> str:
    """Un message de validation anglais de Spring face à sa traduction française est une décision, pas un bug."""
    if e.question:
        return "a_valider"
    if objet == "$.message" and isinstance(spring, str) and ANGLAIS_VALIDATION.search(spring):
        return "a_valider"
    return "ecart"


def comparer(e: Etape, a: Reponse, b: Reponse, ids_a: dict, ids_b: dict) -> list[Ecart]:
    ecarts: list[tuple[str, Any, Any]] = []
    if a.statut != b.statut:
        ecarts.append(("statut", a.statut, b.statut))
    for h in EN_TETES_UTILES:
        va, vb = a.en_tetes.get(h), b.en_tetes.get(h)
        if h == "content-type":  # le charset ajouté par un framework ne change pas le contrat
            va, vb = (va or "").split(";")[0].strip(), (vb or "").split(";")[0].strip()
        if va != vb:
            ecarts.append((f"en-tête {h}", va, vb))
    if a.json is not None or b.json is not None:
        na, nb = normaliser(a.json, ids_a), normaliser(b.json, ids_b)
        _comparer_json(na, nb, "$", ecarts, e.trier_listes or _ordre_libre(e))
    elif "spreadsheetml" in a.en_tetes.get("content-type", "") and a.statut == b.statut == 200:
        ecarts.extend(comparer_excel(a.octets, b.octets))
    elif a.octets != b.octets and a.statut == b.statut:
        ecarts.append(("corps binaire", f"{len(a.octets)} octets", f"{len(b.octets)} octets"))
    return [
        Ecart(f"{e.module}/{e.nom}", o, x, y, _categorie(e, o, x))
        for o, x, y in ecarts
        if not any(o.startswith(f"$.{i}") for i in e.ignorer)
    ]


def rejouer(
    etapes: list[Etape], rapport: Rapport | None = None, sur_echec: Callable[[Ecart], None] | None = None
) -> Rapport:
    rapport = rapport or Rapport()
    spring, python = Backend("spring"), Backend("python")
    spring.connecter()
    python.connecter()
    ids_s: dict = {}
    ids_p: dict = {}
    for e in etapes:
        a, b = spring.executer(e), python.executer(e)
        ecarts = comparer(e, a, b, ids_s, ids_p)
        stat = rapport.par_module.setdefault(e.module, [0, 0])
        stat[0] += 1
        rapport.etapes += 1
        if ecarts:
            rapport.ecarts.extend(ecarts)
            for ec in ecarts:
                if sur_echec:
                    sur_echec(ec)
        else:
            stat[1] += 1
            rapport.identiques += 1
    return rapport

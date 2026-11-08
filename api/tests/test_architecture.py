"""Conventions d'architecture (équivalent de `ArchitectureConventionsTest` d'ArchUnit de l'ancien backend).

Analyse statique des imports et du code de `staport.domains` : un test échoue au premier écart, avec la liste des
fichiers. Les règles : un routeur n'atteint ni dépôt ni modèle de persistance ; un dépôt ne dépend ni d'un service ni
d'un routeur ; un modèle de persistance ne dépend ni de l'API ni des services ; un domaine n'utilise ni le dépôt
ni le routeur d'un autre ; aucune sortie standard ; chaque routeur est étiqueté (documentation OpenAPI).
"""

import ast
from pathlib import Path

import pytest

DOMAINES = Path(__file__).resolve().parents[1] / "src" / "staport" / "domains"


def _modules() -> list[Path]:
    return sorted(p for p in DOMAINES.rglob("*.py") if "__pycache__" not in p.parts)


def _imports(chemin: Path) -> list[tuple[str, int]]:
    """Les modules importés, en absolu (`staport.domains.x.y`), avec leur ligne."""
    paquet = ".".join(("staport", "domains", *chemin.relative_to(DOMAINES).parts[:-1]))
    trouves: list[tuple[str, int]] = []
    for noeud in ast.walk(ast.parse(chemin.read_text(encoding="utf-8"))):
        if isinstance(noeud, ast.Import):
            trouves.extend((alias.name, noeud.lineno) for alias in noeud.names)
        elif isinstance(noeud, ast.ImportFrom):
            base = noeud.module or ""
            if noeud.level:
                racine = paquet.split(".")
                racine = racine[: len(racine) - (noeud.level - 1)]
                base = ".".join([*racine, base] if base else racine)
            trouves.append((base, noeud.lineno))
            trouves.extend((f"{base}.{alias.name}", noeud.lineno) for alias in noeud.names)
    return trouves


def _role(module: str) -> tuple[str, str] | None:
    """`(domaine, fichier)` d'un module `staport.domains.<domaine>.<fichier>...`."""
    morceaux = module.split(".")
    if morceaux[:2] != ["staport", "domains"] or len(morceaux) < 4:
        return None
    return morceaux[2], morceaux[3]


def _ecarts(regle) -> list[str]:  # type: ignore[no-untyped-def]
    ecarts: list[str] = []
    for chemin in _modules():
        domaine = chemin.relative_to(DOMAINES).parts[0]
        fichier = chemin.stem if len(chemin.relative_to(DOMAINES).parts) == 2 else chemin.relative_to(DOMAINES).parts[1]
        for module, ligne in _imports(chemin):
            role = _role(module)
            if role and regle(domaine, fichier, role[0], role[1]):
                ecarts.append(f"{chemin.relative_to(DOMAINES)}:{ligne} importe {module}")
    return ecarts


def test_un_routeur_n_atteint_ni_depot_ni_modele_de_persistance() -> None:
    """Seules les constantes publiques d'un dépôt (listes de tris et de champs) sont admises dans un routeur."""
    fautes: list[str] = []
    for chemin in _modules():
        if chemin.name != "router.py":
            continue
        for noeud in ast.walk(ast.parse(chemin.read_text(encoding="utf-8"))):
            if not isinstance(noeud, ast.ImportFrom) or (not noeud.module and not noeud.level):
                continue
            cible = (noeud.module or "").split(".")[-1]
            if cible in ("repository", "models") and any(not a.name.isupper() for a in noeud.names):
                fautes.append(f"{chemin.relative_to(DOMAINES)}:{noeud.lineno} importe autre chose qu'une constante")
    assert not fautes, fautes


def test_un_depot_ne_depend_ni_d_un_service_ni_d_un_routeur() -> None:
    assert not _ecarts(lambda _d, fichier, _dd, cible: fichier == "repository" and cible in ("service", "router"))


def test_un_modele_de_persistance_ne_depend_ni_de_l_api_ni_des_services() -> None:
    assert not _ecarts(
        lambda _d, fichier, _dd, cible: fichier == "models" and cible in ("router", "service", "schemas", "repository")
    )


def test_un_domaine_n_utilise_ni_le_depot_ni_le_routeur_d_un_autre() -> None:
    ecarts = _ecarts(lambda domaine, _f, autre, cible: autre != domaine and cible in ("repository", "router"))
    assert not ecarts, ecarts


def test_aucune_sortie_standard() -> None:
    fautes: list[str] = []
    for chemin in _modules():
        for noeud in ast.walk(ast.parse(chemin.read_text(encoding="utf-8"))):
            if isinstance(noeud, ast.Call) and isinstance(noeud.func, ast.Name) and noeud.func.id == "print":
                fautes.append(f"{chemin.relative_to(DOMAINES)}:{noeud.lineno}")
    assert not fautes, fautes


@pytest.mark.parametrize("chemin", [p for p in _modules() if p.name == "router.py"], ids=lambda p: p.parent.name)
def test_chaque_routeur_est_etiquete(chemin: Path) -> None:
    for noeud in ast.walk(ast.parse(chemin.read_text(encoding="utf-8"))):
        if isinstance(noeud, ast.Call) and getattr(noeud.func, "id", "") == "APIRouter":
            assert any(mot.arg == "tags" for mot in noeud.keywords), f"{chemin.parent.name} : APIRouter sans tags"

"""Inventaire exhaustif du backend Spring par domaine (KAN-45, ADR 0016 § 7).

Lit le code Java et ses ressources, écrit `docs/migration-fastapi/inventaire.md` : la liste de contrôle de sortie de la
migration (chaque ligne porte sa preuve de parité). Relancer le script régénère le document ; ne pas l'éditer à la main.

    python scripts/migration/inventaire-backend.py
"""

import re
from collections import defaultdict
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]
SOURCES = RACINE / "backend" / "src" / "main" / "java" / "staport" / "rh"
TESTS = RACINE / "backend" / "src" / "test" / "java" / "staport" / "rh"
RESSOURCES = RACINE / "backend" / "src" / "main" / "resources"
SORTIE = RACINE / "docs" / "migration-fastapi" / "inventaire.md"

ROUTES_AUTHENTIFIEES = {"/auth/me", "/auth/logout"}
VERBES = {"Get": "GET", "Post": "POST", "Put": "PUT", "Patch": "PATCH", "Delete": "DELETE"}
RE_CLASSE_MAPPING = re.compile(r'^@RequestMapping\(\s*(?:value\s*=\s*)?"([^"]*)"', re.M)
RE_METHODE = re.compile(r"@(Get|Post|Put|Patch|Delete)Mapping(?:\(([^)]*)\))?")
RE_CHEMIN = re.compile(r'"([^"]*)"')
RE_AUTORITE = re.compile(r"hasAuthority\('([A-Z_]+)'\)|hasAnyAuthority\(([^)]*)\)")
RE_OUTIL = re.compile(r'@McpTool\(\s*name\s*=\s*"([^"]+)"')
RE_AUDIT = re.compile(r'@AuditableAction\(\s*action\s*=\s*"([^"]+)"')
RE_PLANIFIE = re.compile(r"@Scheduled\(([^)]*)\)")
RE_METRIQUE = re.compile(r'(?:counter|timer|gauge|Counter\.builder|Timer\.builder|Gauge\.builder)\(\s*"(rh\.[a-z0-9._-]+)"')
RE_CONFIG = re.compile(r'\$\{([a-zA-Z0-9_.-]+)(?::[^}]*)?\}')
RE_EXCEPTION = re.compile(r"^public (?:final )?class (\w+Exception)\b", re.M)
RE_ENTITE = re.compile(r"@Entity\b")
RE_TABLE = re.compile(r'@Table\(\s*name\s*=\s*"([^"]+)"')
RE_AUDITE = re.compile(r"@Audited\b")
RE_TEST = re.compile(r"@(?:Test|ParameterizedTest|RepeatedTest)\b")


def lire(chemin: Path) -> str:
    return chemin.read_text(encoding="utf-8", errors="replace")


def domaine_de(chemin: Path, base: Path) -> str:
    return chemin.relative_to(base).parts[0]


def joindre(prefixe: str, chemin: str) -> str:
    return "/" + "/".join(p for p in (prefixe.strip("/"), chemin.strip("/")) if p)


def routes(source: str) -> list[tuple[str, str, str]]:
    """(verbe, chemin, permission) de chaque méthode de contrôleur ; la permission est lue sur le même bloc."""
    prefixe = ""
    m = RE_CLASSE_MAPPING.search(source)
    if m:
        prefixe = m.group(1)
    classe = source.split("\npublic ", 1)[0]
    de_classe = sorted({a or b for a, b in RE_AUTORITE.findall(classe)})
    trouvees: list[tuple[str, str, str]] = []
    lignes = source.split("\n")
    for i, ligne in enumerate(lignes):
        m = RE_METHODE.search(ligne)
        if not m:
            continue
        chemins = RE_CHEMIN.findall(m.group(2) or "")
        chemin = joindre(prefixe, chemins[0] if chemins else "")
        debut = i
        while debut > 0 and not lignes[debut - 1].rstrip().endswith(("}", ";", "{")) or (debut > 0 and lignes[debut - 1].lstrip().startswith(("@", "*", "/*"))):
            debut -= 1
        fin = i
        while fin < len(lignes) - 1 and not (lignes[fin].rstrip().endswith("{") and not lignes[fin].lstrip().startswith("@")):
            fin += 1
        bloc = "\n".join(lignes[debut : fin + 1])
        permissions = sorted({a or b for a, b in RE_AUTORITE.findall(bloc)}) or de_classe
        if permissions:
            brut = ", ".join(permissions).replace("'", "")
        else:
            brut = "authentifiée (aucune permission)" if chemin in ROUTES_AUTHENTIFIEES else "publique (SecurityConfig)"
        trouvees.append((VERBES[m.group(1)], chemin, brut))
    return trouvees


def principal() -> None:
    par_domaine: dict[str, dict[str, object]] = defaultdict(
        lambda: {
            "lignes": 0,
            "fichiers": 0,
            "routes": [],
            "outils": [],
            "audits": [],
            "planifies": [],
            "metriques": set(),
            "config": set(),
            "exceptions": [],
            "entites": [],
            "tests": 0,
            "fichiers_test": 0,
        }
    )
    for chemin in sorted(SOURCES.rglob("*.java")):
        d = domaine_de(chemin, SOURCES)
        if chemin.parent == SOURCES:
            d = "(racine)"
        texte = lire(chemin)
        e = par_domaine[d]
        e["lignes"] += texte.count("\n") + 1  # type: ignore[operator]
        e["fichiers"] += 1  # type: ignore[operator]
        if "Controller" in chemin.name:
            e["routes"] += [(*r, chemin.name) for r in routes(texte)]  # type: ignore[operator]
        e["outils"] += [(n, chemin.name) for n in RE_OUTIL.findall(texte)]  # type: ignore[operator]
        e["audits"] += [(n, chemin.name) for n in RE_AUDIT.findall(texte)]  # type: ignore[operator]
        e["planifies"] += [(m.strip(), chemin.name) for m in RE_PLANIFIE.findall(texte)]  # type: ignore[operator]
        e["metriques"] |= set(RE_METRIQUE.findall(texte))  # type: ignore[operator]
        e["config"] |= set(RE_CONFIG.findall(texte))  # type: ignore[operator]
        e["exceptions"] += RE_EXCEPTION.findall(texte)  # type: ignore[operator]
        if RE_ENTITE.search(texte):
            t = RE_TABLE.search(texte)
            e["entites"].append((chemin.stem, t.group(1) if t else "?", bool(RE_AUDITE.search(texte))))  # type: ignore[attr-defined]
    for chemin in sorted(TESTS.rglob("*.java")):
        d = domaine_de(chemin, TESTS)
        if chemin.parent == TESTS:
            d = "(racine)"
        e = par_domaine[d]
        e["tests"] += len(RE_TEST.findall(lire(chemin)))  # type: ignore[operator]
        e["fichiers_test"] += 1  # type: ignore[operator]

    migrations = sorted((RESSOURCES / "db" / "migration").glob("V*.sql"), key=lambda m: int(re.match(r"V(\d+)", m.name).group(1)))  # type: ignore[union-attr]
    modeles_rapport = sorted(p.name for p in (RESSOURCES / "report").rglob("*") if p.is_file())
    cles_yaml = sorted(set(RE_CONFIG.findall(lire(RESSOURCES / "application.yml"))))

    total = lambda cle: sum(e[cle] for e in par_domaine.values())  # type: ignore[misc]  # noqa: E731
    sortie = [
        "# Inventaire du backend Spring (KAN-45)",
        "",
        "> Document **généré** par `scripts/migration/inventaire-backend.py` : ne pas l'éditer à la main, relancer le script.",
        "> C'est la liste de contrôle de sortie de la migration (ADR 0016, § 7) : une ligne n'est cochée dans le suivi Jira",
        "> qu'avec sa preuve de parité (test, comparaison OpenAPI, comparaison d'images pour les PDF).",
        "",
        "## Totaux",
        "",
        f"- {total('fichiers')} fichiers Java, {total('lignes')} lignes ; {total('fichiers_test')} fichiers de test, {total('tests')} tests.",
        f"- {sum(len(e['routes']) for e in par_domaine.values())} routes HTTP, "  # type: ignore[arg-type]
        f"{sum(len(e['outils']) for e in par_domaine.values())} outils MCP, "  # type: ignore[arg-type]
        f"{len({a for e in par_domaine.values() for a, _ in e['audits']})} actions d'audit distinctes, "  # type: ignore[attr-defined]
        f"{sum(len(e['planifies']) for e in par_domaine.values())} tâches planifiées.",  # type: ignore[arg-type]
        f"- {len(migrations)} migrations Flyway (`{migrations[0].name}` à `{migrations[-1].name}`), "
        f"{len(modeles_rapport)} fichiers de modèles de rapport, {len(cles_yaml)} clés de configuration lues dans `application.yml`.",
        "",
        "## Par domaine",
        "",
        "| Domaine | Fichiers | Lignes | Routes | Outils MCP | Actions d'audit | Entités | Tests |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for d, e in sorted(par_domaine.items()):
        sortie.append(
            f"| {d} | {e['fichiers']} | {e['lignes']} | {len(e['routes'])} | {len(e['outils'])} | "  # type: ignore[arg-type]
            f"{len({a for a, _ in e['audits']})} | {len(e['entites'])} | {e['tests']} |"  # type: ignore[attr-defined,arg-type]
        )
    for d, e in sorted(par_domaine.items()):
        sortie += ["", f"## {d}", ""]
        if e["routes"]:
            sortie += ["### Routes", "", "| Verbe | Chemin | Permission | Source |", "|---|---|---|---|"]
            sortie += [f"| {v} | `{c}` | {p} | {f} |" for v, c, p, f in sorted(e["routes"])]  # type: ignore[misc,union-attr]
            sortie.append("")
        if e["outils"]:
            sortie += ["### Outils MCP", ""] + [f"- `{n}` ({f})" for n, f in sorted(e["outils"])] + [""]  # type: ignore[misc,union-attr]
        if e["audits"]:
            sortie += ["### Actions d'audit", ""] + [
                f"- `{a}` ({f})" for a, f in sorted(set(e["audits"]))  # type: ignore[arg-type]
            ] + [""]
        if e["planifies"]:
            sortie += ["### Tâches planifiées", ""] + [f"- `{m}` ({f})" for m, f in e["planifies"]] + [""]  # type: ignore[union-attr]
        if e["metriques"]:
            sortie += ["### Métriques", ""] + [f"- `{m}`" for m in sorted(e["metriques"])] + [""]  # type: ignore[call-overload]
        if e["entites"]:
            sortie += ["### Entités et tables", "", "| Entité | Table | Historisée (`@Audited`) |", "|---|---|---|"]
            sortie += [f"| {n} | `{t}` | {'oui' if a else 'non'} |" for n, t, a in sorted(e["entites"])]  # type: ignore[misc,union-attr]
            sortie.append("")
        if e["exceptions"]:
            sortie += ["### Exceptions métier", "", ", ".join(f"`{x}`" for x in sorted(e["exceptions"])), ""]  # type: ignore[call-overload]
        if e["config"]:
            sortie += ["### Clés de configuration lues", "", ", ".join(f"`{k}`" for k in sorted(e["config"])), ""]  # type: ignore[call-overload]

    sortie += ["## Migrations Flyway", ""] + [f"- `{m.name}`" for m in migrations] + [""]
    sortie += ["## Modèles de rapport (PDF)", ""] + [f"- `{m}`" for m in modeles_rapport] + [""]
    sortie += ["## Clés de `application.yml`", "", ", ".join(f"`{k}`" for k in cles_yaml), ""]
    SORTIE.parent.mkdir(parents=True, exist_ok=True)
    SORTIE.write_text("\n".join(sortie), encoding="utf-8", newline="\n")
    print(f"écrit {SORTIE.relative_to(RACINE)} ({len(sortie)} lignes)")


if __name__ == "__main__":
    principal()

"""Exécute les scénarios sur les deux backends et imprime le tableau par module.

uv run python -m tests.differentiel.run [module ...]

Un fichier de scénarios suppose une base vierge : lancer.sh remet les bases à zéro avant chacun.
"""

import importlib
import sys

from .harnais import Ecart, Rapport, rejouer

SCENARIOS = [
    "scenarios_modeles",
    "scenarios_referentiels",
    "scenarios_paie_import",
    "scenarios_paie_sorties",
    "scenarios_paie_lectures",
    "scenarios_admin",
    "scenarios_auth",
    "scenarios_heures_supp",
]


def main(filtres: list[str]) -> int:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]  # le PDF contient des espaces insécables fines
    rapport = Rapport()
    for nom in SCENARIOS:
        etapes = importlib.import_module(f"tests.differentiel.{nom}").etapes()
        if filtres and nom not in filtres:
            etapes = [e for e in etapes if e.module in filtres]
        if not etapes:
            continue
        rejouer(etapes, rapport)
    print(f"{'module':<14}{'comparées':>10}{'identiques':>11}{'écarts':>8}")
    for module, (total, ok) in rapport.par_module.items():
        print(f"{module:<14}{total:>10}{ok:>11}{total - ok:>8}")
    bugs = [ec for ec in rapport.ecarts if ec.categorie == "ecart"]
    valider = [ec for ec in rapport.ecarts if ec.categorie == "a_valider"]
    decides = [ec for ec in rapport.ecarts if ec.categorie == "decide"]
    print(
        f"\nÉCARTS À CORRIGER : {len(bugs)} · À VALIDER PAR LE PROPRIÉTAIRE : {len(valider)}"
        f" · REFONTES DÉCIDÉES : {len(decides)}"
    )
    for ec in bugs:
        _afficher(ec)
    for ec in valider:
        _afficher(ec, "À VALIDER")
    return 1 if bugs else 0


def _afficher(ec: Ecart, etiquette: str = "ÉCART") -> None:
    print(f"{etiquette} {ec.etape} · {ec.objet} : spring={ec.spring!r} python={ec.python!r}")


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

"""Exécute les scénarios sur les deux backends et imprime le tableau par module.

uv run python -m tests.differentiel.run [module ...]
"""

import importlib
import sys

from .harnais import Ecart, rejouer

SCENARIOS = ["scenarios_modeles", "scenarios_referentiels"]


def main(filtres: list[str]) -> int:
    etapes = []
    for nom in SCENARIOS:
        etapes += importlib.import_module(f"tests.differentiel.{nom}").etapes()
    if filtres:
        etapes = [e for e in etapes if e.module in filtres]
    rapport = rejouer(etapes)
    print(f"{'module':<14}{'comparées':>10}{'identiques':>11}{'écarts':>8}")
    for module, (total, ok) in rapport.par_module.items():
        print(f"{module:<14}{total:>10}{ok:>11}{total - ok:>8}")
    bugs = [ec for ec in rapport.ecarts if ec.categorie == "ecart"]
    valider = [ec for ec in rapport.ecarts if ec.categorie == "a_valider"]
    print(f"\nÉCARTS À CORRIGER : {len(bugs)} · À VALIDER PAR LE PROPRIÉTAIRE : {len(valider)}")
    for ec in bugs:
        _afficher(ec)
    for ec in valider:
        _afficher(ec, "À VALIDER")
    return 1 if bugs else 0


def _afficher(ec: Ecart, etiquette: str = "ÉCART") -> None:
    print(f"{etiquette} {ec.etape} · {ec.objet} : spring={ec.spring!r} python={ec.python!r}")


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

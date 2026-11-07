"""Exécute les scénarios sur les deux backends et imprime le tableau par module.

uv run python -m tests.differentiel.run [module ...]
"""

import importlib
import sys

from .harnais import Ecart, rejouer

SCENARIOS = ["scenarios_modeles"]


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
    for ec in rapport.ecarts:
        _afficher(ec)
    return 1 if rapport.ecarts else 0


def _afficher(ec: Ecart) -> None:
    print(f"ÉCART {ec.etape} · {ec.objet} : spring={ec.spring!r} python={ec.python!r}")


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

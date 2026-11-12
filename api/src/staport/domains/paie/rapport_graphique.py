"""Graphique d'évolution du rapport de paie : Effectif (axe de gauche) et Montant de la paie en DH (axe de droite).

Le tracé est confié à Pygal (barres groupées, second axe vertical natif) ; ce module ne fait que choisir les échelles
et la mise en forme. Le SVG est intégré tel quel dans le HTML du rapport, que WeasyPrint rend en PDF.
"""

from collections.abc import Sequence
from decimal import Decimal
from math import floor, log10
from typing import Any, Protocol, cast

import pygal  # pyright: ignore[reportMissingTypeStubs]
from pygal.style import Style  # pyright: ignore[reportMissingTypeStubs]

# Pygal n'a pas d'annotations : une façade `Any` évite de diluer le typage strict du reste du module.
_pygal = cast(Any, pygal)
_Style = cast(Any, Style)

HAUTEUR_GRAPHIQUE = 196  # points ; le bloc du rapport en réserve 200
LARGEUR_GRAPHIQUE = 802  # points : la largeur utile d'une page
_PX_PAR_PT = 4 / 3  # Pygal compte en pixels CSS, le rapport en points

COULEUR_EFFECTIF = "#3987E5"
COULEUR_MONTANT = "#D95926"
_GRAND_PAS = (1, 2, 5, 10)
_GRADUATIONS = 5
ESPACE_INSECABLE = chr(0xA0)


class _Point(Protocol):
    @property
    def periode(self) -> int: ...
    @property
    def masse(self) -> Decimal: ...
    @property
    def effectif(self) -> int: ...


def _echelle(maximum: float, *, entiere: bool = False) -> float:
    """Borne haute d'un axe partant de zéro, graduée de 1, 2 ou 5 fois une puissance de dix, en 5 intervalles.

    `entiere` impose un pas d'au moins 1 : un effectif ne se gradue pas en 0,2 personne."""
    if maximum <= 0:
        return float(_GRADUATIONS)
    brut = maximum / _GRADUATIONS
    if entiere:
        brut = max(brut, 1.0)
    puissance = 10 ** floor(log10(brut))
    pas = next(m * puissance for m in _GRAND_PAS if m * puissance >= brut)
    return pas * _GRADUATIONS


def _format(valeur: float) -> str:
    """Entier à espaces insécables ; les millions s'abrègent pour que l'axe de droite reste lisible."""
    if abs(valeur) >= 1_000_000:
        return f"{valeur / 1_000_000:.1f}".replace(".", ",").removesuffix(",0") + " M"
    return f"{round(valeur):,}".replace(",", ESPACE_INSECABLE)


def _entier(valeur: float) -> str:
    """Valeur exacte, à espaces insécables."""
    return f"{round(valeur):,}".replace(",", ESPACE_INSECABLE)


def _style(**surcharges: Any) -> Any:
    police = "Liberation Serif, serif"
    reglages: dict[str, Any] = {
        "background": "transparent",
        "plot_background": "transparent",
        "foreground": "#000000",
        "foreground_strong": "#000000",
        "foreground_subtle": "#CCCCCC",
        "colors": (COULEUR_EFFECTIF, COULEUR_MONTANT),
        "opacity": "1",
        "opacity_hover": "1",
        "font_family": police,
        "label_font_family": police,
        "major_label_font_family": police,
        "title_font_family": police,
        "legend_font_family": police,
        "label_font_size": 9,
        "major_label_font_size": 9,
        "title_font_size": 9,
        "legend_font_size": 9,
        "value_font_size": 9,
        "value_label_font_size": 9,
        "guide_stroke_dasharray": "3,3",
        "major_guide_stroke_dasharray": "3,3",
    }
    return _Style(**{**reglages, **surcharges})


def graphique_evolution(points: Sequence[_Point], hauteur: int = HAUTEUR_GRAPHIQUE) -> str:
    """Le SVG du graphique, ou rien sans donnée. Deux courbes, un point par mois, dans l'ordre reçu."""
    if not points:
        return ""
    effectifs = [point.effectif for point in points]
    montants = [float(point.masse) for point in points]
    borne_effectif = _echelle(max(effectifs), entiere=True)
    borne_montant = _echelle(max(montants))
    graphique = _pygal.Line(
        width=round(LARGEUR_GRAPHIQUE * _PX_PAR_PT),
        height=round(hauteur * _PX_PAR_PT),
        css=[
            "file://style.css",
            "file://graph.css",
            "inline:.pygal-chart .series .line{stroke-width:3px !important}",
            "inline:.pygal-chart .text-overlay text{transform:translateY(-19px)}",
        ],
        dots_size=4,
        print_values=True,
        print_values_position="top",
        explicit_size=True,
        style=_style(),
        js=[],
        interactive=False,
        disable_xml_declaration=True,
        legend_at_bottom=True,
        legend_at_bottom_columns=2,
        legend_box_size=10,
        margin=4,
        range=(0, borne_effectif),
        secondary_range=(0, borne_montant),
        y_labels=[borne_effectif / _GRADUATIONS * rang for rang in range(_GRADUATIONS + 1)],
        y_title="Effectif (personnes)",
        value_formatter=_format,
        x_label_rotation=0,
    )
    # Une case vide à chaque bout garde les premiers et derniers points à distance des axes.
    graphique.x_labels = ["", *(f"{point.periode % 100}/{point.periode // 100}" for point in points), ""]
    graphique.add("Effectif (personnes), axe de gauche", [None, *effectifs, None], formatter=_entier)
    graphique.add("Montant de la paie (DH), axe de droite", [None, *montants, None], secondary=True, formatter=_entier)
    return (
        f'<div class="graphique-evolution" style="height: {hauteur + 4}pt">'
        + graphique.render(is_unicode=True)
        + "</div>"
    )


LARGEUR_REPARTITION = 802  # points : la largeur utile d'une page
_PARTS_VISIBLES = 20  # au-delà, le reste forme « Autres » pour que chaque ligne garde sa hauteur
_HAUTEUR_PAR_PART = 28  # points : deux barres et leur marge
_HAUTEUR_FIXE_REPARTITION = 50  # légende et marges
HAUTEUR_MAX_REPARTITION = _HAUTEUR_FIXE_REPARTITION + _HAUTEUR_PAR_PART * (_PARTS_VISIBLES + 1)


def _pourcentage(valeur: float, total: float) -> str:
    return f"{valeur * 100 / total:.1f}".replace(".", ",") + " %" if total else "0 %"


def hauteur_repartition(parts: int, minimale: bool = False) -> int:
    """Hauteur du graphique pour `parts` lignes : chaque ligne garde la même épaisseur, quelle que soit la page."""
    parts = min(parts, _PARTS_VISIBLES + 1)
    return _HAUTEUR_FIXE_REPARTITION + (18 if minimale else _HAUTEUR_PAR_PART) * parts


def _reduire(parts: Sequence[tuple[str, float, float]]) -> list[tuple[str, float, float]]:
    """Les plus grands montants d'abord ; les suivants se regroupent en « Autres »."""
    triees = sorted((part for part in parts if part[1] > 0 or part[2] > 0), key=lambda part: -part[2])
    if len(triees) <= _PARTS_VISIBLES + 1:
        return triees
    reste = triees[_PARTS_VISIBLES:]
    return [*triees[:_PARTS_VISIBLES], ("Autres", sum(p[1] for p in reste), sum(p[2] for p in reste))]


def nombre_parts(parts: Sequence[tuple[str, float, float]]) -> int:
    return len(_reduire(parts))


def graphique_repartition(parts: Sequence[tuple[str, float, float]], hauteur: int) -> str:
    """Un graphique, deux barres par ligne (effectif et montant de la paie, chacune à sa propre échelle).

    La valeur exacte et le pourcentage du total sont écrits au bout de chaque barre ; rien sans donnée."""
    retenues = _reduire(parts)
    if not retenues:
        return ""
    total_effectif = sum(part[1] for part in retenues)
    total_montant = sum(part[2] for part in retenues)

    def point(valeur: float, total: float) -> dict[str, Any]:
        return {"value": valeur, "label": f"{_entier(valeur)} ({_pourcentage(valeur, total)})"}

    graphique = _pygal.HorizontalBar(
        width=round(LARGEUR_REPARTITION * _PX_PAR_PT),
        height=round(hauteur * _PX_PAR_PT),
        explicit_size=True,
        style=_style(value_font_size=9, value_label_font_size=9, label_font_size=9, major_label_font_size=9),
        js=[],
        interactive=False,
        disable_xml_declaration=True,
        legend_at_bottom=True,
        legend_at_bottom_columns=2,
        legend_box_size=10,
        # Sur un graphique horizontal Pygal échange les axes : « x » désigne les valeurs, « y » les noms.
        show_x_labels=False,
        show_y_labels=True,
        show_x_guides=False,
        show_y_guides=False,
        margin=4,
        truncate_label=-1,
        rounded_bars=1,
        print_labels=True,
        print_values=False,
        print_values_position="top",
        # Une marge à droite des barres les plus longues pour que leur étiquette reste dans le graphique.
        range=(0, max(part[1] for part in retenues) * 1.45),
        secondary_range=(0, max(part[2] for part in retenues) * 1.45),
    )
    # La première étiquette se dessine en bas : la plus grande part est donnée en dernier pour apparaître en haut.
    ordre = list(reversed(retenues))
    graphique.x_labels = [libelle if len(libelle) <= 30 else libelle[:29] + "…" for libelle, _, _ in ordre]
    graphique.add("Effectif (personnes)", [point(effectif, total_effectif) for _, effectif, _ in ordre])
    graphique.add("Montant de la paie (DH)", [point(montant, total_montant) for _, _, montant in ordre], secondary=True)
    return (
        f'<div class="repartition-graphique" style="height: {hauteur + 4}pt">'
        + graphique.render(is_unicode=True)
        + "</div>"
    )


__all__ = [
    "COULEUR_EFFECTIF",
    "COULEUR_MONTANT",
    "HAUTEUR_GRAPHIQUE",
    "graphique_evolution",
    "graphique_repartition",
    "hauteur_repartition",
    "nombre_parts",
]

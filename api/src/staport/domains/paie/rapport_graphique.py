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


def _echelle(maximum: float) -> float:
    """Borne haute d'un axe partant de zéro, graduée de 1, 2 ou 5 fois une puissance de dix, en 5 intervalles."""
    if maximum <= 0:
        return float(_GRADUATIONS)
    brut = maximum / _GRADUATIONS
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
        "guide_stroke_dasharray": "3,3",
        "major_guide_stroke_dasharray": "3,3",
    }
    return _Style(**{**reglages, **surcharges})


def graphique_evolution(points: Sequence[_Point]) -> str:
    """Le SVG du graphique, ou rien sans donnée. Un mois par groupe de barres, dans l'ordre reçu."""
    if not points:
        return ""
    effectifs = [point.effectif for point in points]
    montants = [float(point.masse) for point in points]
    borne_effectif = _echelle(max(effectifs))
    borne_montant = _echelle(max(montants))
    graphique = _pygal.Bar(
        width=round(LARGEUR_GRAPHIQUE * _PX_PAR_PT),
        height=round(HAUTEUR_GRAPHIQUE * _PX_PAR_PT),
        explicit_size=True,
        style=_style(),
        js=[],
        interactive=False,
        disable_xml_declaration=True,
        legend_at_bottom=True,
        legend_box_size=10,
        margin=4,
        range=(0, borne_effectif),
        secondary_range=(0, borne_montant),
        y_labels=[borne_effectif / _GRADUATIONS * rang for rang in range(_GRADUATIONS + 1)],
        y_title="Effectif (personnes)",
        value_formatter=_format,
        rounded_bars=1,
        x_label_rotation=0,
    )
    graphique.x_labels = [f"{point.periode % 100}/{point.periode // 100}" for point in points]
    graphique.add("Effectif (personnes), axe de gauche", effectifs)
    graphique.add("Montant de la paie (DH), axe de droite", montants, secondary=True)
    return (
        f'<div class="graphique-evolution" style="height: {HAUTEUR_GRAPHIQUE + 4}pt">'
        + graphique.render(is_unicode=True)
        + "</div>"
    )


LARGEUR_REPARTITION = 396  # points : deux graphiques côte à côte dans la largeur utile
HAUTEUR_REPARTITION = 400
_PARTS_VISIBLES = 20  # au-delà, le reste forme « Autres » pour que chaque barre garde sa hauteur


def _pourcentage(valeur: float, total: float) -> str:
    return f"{valeur * 100 / total:.1f}".replace(".", ",") + " %" if total else "0 %"


def _reduire(parts: Sequence[tuple[str, float]]) -> list[tuple[str, float]]:
    """Les plus grandes parts d'abord ; les suivantes se regroupent en « Autres »."""
    triees = sorted((part for part in parts if part[1] > 0), key=lambda part: -part[1])
    if len(triees) <= _PARTS_VISIBLES + 1:
        return triees
    reste = sum(valeur for _, valeur in triees[_PARTS_VISIBLES:])
    return [*triees[:_PARTS_VISIBLES], ("Autres", reste)]


def graphique_repartition(titre: str, parts: Sequence[tuple[str, float]], couleur: str) -> str:
    """Barres horizontales triées : la valeur exacte et le pourcentage du total sont écrits au bout de chaque barre."""
    retenues = _reduire(parts)
    if not retenues:
        return ""
    total = sum(valeur for _, valeur in retenues)

    def etiquette(libelle: str, valeur: float) -> str:
        nom = libelle if len(libelle) <= 26 else libelle[:25] + "…"
        return f"{nom} : {_entier(valeur)} ({_pourcentage(valeur, total)})"

    graphique = _pygal.HorizontalBar(
        width=round(LARGEUR_REPARTITION * _PX_PAR_PT),
        height=round(HAUTEUR_REPARTITION * _PX_PAR_PT),
        explicit_size=True,
        style=_style(
            colors=(couleur,), value_font_size=8, label_font_size=8, major_label_font_size=8, title_font_size=11
        ),
        js=[],
        interactive=False,
        disable_xml_declaration=True,
        show_legend=False,
        # Sur un graphique horizontal Pygal échange les axes : « x » désigne les valeurs, « y » les noms.
        show_x_labels=False,
        show_y_labels=True,
        show_x_guides=False,
        show_y_guides=False,
        title=titre,
        margin=4,
        truncate_label=-1,
        rounded_bars=1,
    )
    # La première étiquette se dessine en bas : la plus grande part est donnée en dernier pour apparaître en haut.
    graphique.x_labels = [etiquette(libelle, valeur) for libelle, valeur in reversed(retenues)]
    graphique.add(titre, [valeur for _, valeur in reversed(retenues)])
    return graphique.render(is_unicode=True)


__all__ = ["COULEUR_EFFECTIF", "COULEUR_MONTANT", "HAUTEUR_GRAPHIQUE", "graphique_evolution", "graphique_repartition"]

from dataclasses import dataclass
from decimal import Decimal

import pytest

from staport.domains.paie.rapport_calcul import mesurer, mesurer_precedent, regrouper_sections, repartir_sections


@dataclass
class Bulletin:
    salaire_total: Decimal
    chantier_id: int
    observation: str | None


def test_indicateurs_et_sorties_sur_les_bulletins_historiques() -> None:
    bulletins = [
        Bulletin(Decimal("1234.56"), 1, " STC "),
        Bulletin(Decimal("100.00"), 1, "sortie"),
        Bulletin(Decimal("0"), 2, None),
    ]
    resultat = mesurer(bulletins)
    assert resultat.masse == Decimal("1334.56")
    assert (resultat.effectif, resultat.chantiers, resultat.stc) == (3, 2, 2)
    assert resultat.montant_stc == Decimal("1334.56")


def test_mois_precedent_absent_distinct_d_une_masse_nulle() -> None:
    assert mesurer_precedent([]) is None
    resultat = mesurer_precedent([Bulletin(Decimal("0"), 1, None)])
    assert resultat is not None and resultat.masse == 0 and resultat.effectif == 1


def test_sections_equipes_et_reste_sans_doublon() -> None:
    @dataclass
    class Ligne:
        equipe_libelle: str | None

    ch, op, sans = Ligne("Chauffeurs"), Ligne("Opérateurs"), Ligne(None)
    assert repartir_sections([ch, op, sans], {"Chauffeurs"}) == [
        ("Chauffeurs", [ch]),
        (None, [op, sans]),
    ]
    assert repartir_sections([ch, op, sans], set()) == [(None, [ch, op, sans])]
    assert repartir_sections([ch, op, sans], {"Chauffeurs", "Opérateurs"}) == [
        ("Chauffeurs", [ch]),
        ("Opérateurs", [op]),
        (None, [sans]),
    ]
    assert regrouper_sections([ch, op, sans], {"Chauffeurs", "Opérateurs"}, []) == [
        ("Chauffeurs", [ch], False),
        ("Opérateurs", [op], False),
        (None, [sans], False),
    ]
    assert regrouper_sections([ch, op, sans], set(), [["Chauffeurs", "Opérateurs"]]) == [
        ("Chauffeurs + Opérateurs", [ch, op], True),
        (None, [sans], False),
    ]
    with pytest.raises(ValueError):
        regrouper_sections([ch, op, sans], set(), [["Chauffeurs", "Opérateurs"], ["Opérateurs", "Autres"]])

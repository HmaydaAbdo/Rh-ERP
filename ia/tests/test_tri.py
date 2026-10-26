"""Tri des messages sans donnée : seuls les messages de pure politesse évitent le parcours complet."""

import pytest

from erp_rh_ia.tri import REPONSES, trier


@pytest.mark.parametrize(
    ("message", "sorte"),
    [
        ("Bonjour", "salutation"),
        ("hello", "salutation"),
        ("Salut, ça va ?", "salutation"),
        ("Bonjour à tous", "salutation"),
        ("salam alaykoum", "salutation"),
        ("السلام عليكم", "salutation"),
        ("أهلا", "salutation"),
        ("merci beaucoup !", "remerciement"),
        ("شكرا جزيلا", "remerciement"),
        ("Merci, au revoir", "au_revoir"),
        ("Que sais-tu faire ?", "aide"),
        ("aide", "aide"),
    ],
)
def test_un_message_de_politesse_est_reconnu(message: str, sorte: str) -> None:
    assert trier(message) == sorte


@pytest.mark.parametrize(
    "message",
    [
        "Bonjour, quelle est la masse salariale ?",
        "Combien d'employés sont en poste ?",
        "2026-09",
        "ok",
        "",
        "merci de me donner l'effectif du chantier C-12",
    ],
)
def test_une_question_suit_le_parcours_complet(message: str) -> None:
    assert trier(message) is None


def test_les_reponses_immediates_ne_contiennent_aucun_chiffre() -> None:
    # Le vérificateur ne passe pas sur ces réponses : elles ne doivent affirmer aucune valeur.
    assert all(not any(c.isdigit() for c in texte) for texte in REPONSES.values())

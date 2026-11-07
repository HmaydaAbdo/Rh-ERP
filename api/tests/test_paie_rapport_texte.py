import pytest

from staport.domains.paie.rapport_texte import decouper, decouper_lignes, hauteur_ligne_employe, lignes


def test_ligne_vide_et_mot_large() -> None:
    assert decouper(None, 40, 10.5) == [""]
    assert decouper("", 40, 10.5) == [""]
    assert decouper("abcdef", 1, 10.5) == list("abcdef")


def test_espaces_insecables_des_montants_et_retour_a_la_ligne() -> None:
    assert decouper("1\u00a0234,00", 100, 10.5) == ["1\u00a0234,00"]
    assert lignes("Nom très long avec plusieurs mots", 40, 10.5) > 1


def test_hauteur_variable_des_lignes_du_tableau() -> None:
    valeurs = ["Nom", "Fonction", "CIN", "20", "-", "-", "5\u00a0000,00", "-", "-", "5\u00a0000,00", ""]
    assert hauteur_ligne_employe(valeurs, avec_equipe=False) == 16
    valeurs[0] = "Un nom de collaborateur particulièrement long qui passe sur plusieurs lignes"
    assert hauteur_ligne_employe(valeurs, avec_equipe=False) > 16
    with pytest.raises(ValueError):
        hauteur_ligne_employe(valeurs, avec_equipe=True)


def test_decoupage_physique_ne_perd_aucune_ligne() -> None:
    tranches = decouper_lignes([16.0] * 65, 399, 479)
    assert [index for tranche in tranches for index in tranche] == list(range(65))
    assert [len(tranche) for tranche in tranches] == [24, 29, 12]
    with pytest.raises(ValueError):
        decouper_lignes([500], 399, 479)

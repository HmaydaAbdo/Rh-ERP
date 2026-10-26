import json
from decimal import Decimal

from erp_rh_ia.verification import extraire_nombres, nombres_autorises, valeurs_surface, verifier

RESULTAT = {
    "periode": "2026-09",
    "indicateurs": {"masse": 1250000.50, "effectif": 412, "coutMoyen": "3034.0"},
    "principauxChantiers": [{"code": "CH-17", "masse": Decimal("98000.00")}],
    "actif": True,
}


def test_formats_francais_et_anglais_sont_la_meme_valeur() -> None:
    assert extraire_nombres("1 250 000,50 MAD") == [Decimal("1250000.5")]
    assert extraire_nombres("1250000.50") == [Decimal("1250000.5")]
    assert extraire_nombres("3\u202f034 €") == [Decimal("3034")]
    assert extraire_nombres("aucun chiffre") == []


def test_une_reponse_qui_reprend_les_chiffres_des_outils_est_conforme() -> None:
    reponse = (
        "En septembre 2026, la masse salariale est de 1 250 000,50 MAD pour 412 bulletins ; "
        "le chantier CH-17 pèse 98 000 MAD (coût moyen 3 034)."
    )
    assert verifier(reponse, [RESULTAT]).conforme


def test_un_chiffre_calcule_par_le_modele_est_rejete() -> None:
    resultat = verifier("La masse a augmenté de 12,5 % pour 412 bulletins.", [RESULTAT])
    assert not resultat.conforme
    assert resultat.nombres_inconnus == ("12,5",)


def test_un_total_invente_est_rejete_meme_arrondi() -> None:
    assert not verifier("Environ 1 300 000 MAD.", [RESULTAT]).conforme


def test_les_nombres_de_la_question_sont_admis() -> None:
    assert verifier("Pour le chantier 4021, aucune donnée.", [], question="Masse du chantier 4021 ?").conforme


def test_les_booleens_ne_sont_pas_des_nombres() -> None:
    assert Decimal(1) not in nombres_autorises([{"actif": True}])


def test_les_periodes_et_codes_apportent_leurs_nombres() -> None:
    autorises = nombres_autorises([RESULTAT])
    assert {Decimal(2026), Decimal(9), Decimal(17)} <= autorises


def test_les_valeurs_d_une_surface_a2ui_excluent_version_et_identifiants() -> None:
    enveloppe = json.dumps(
        {
            "a2ui_operations": [
                {"version": "v0.9", "createSurface": {"surfaceId": "s-2026", "catalogId": "basic"}},
                {
                    "version": "v0.9",
                    "updateComponents": {
                        "surfaceId": "s-2026",
                        "components": [{"id": "ligne-3", "component": "Text", "text": "Effectif : 412"}],
                    },
                },
                {"version": "v0.9", "updateDataModel": {"surfaceId": "s-2026", "value": {"masse": 1250.5}}},
            ]
        }
    )

    assert valeurs_surface(enveloppe).splitlines() == ["Effectif : 412", "1250.5"]
    assert valeurs_surface("pas du JSON") == ""

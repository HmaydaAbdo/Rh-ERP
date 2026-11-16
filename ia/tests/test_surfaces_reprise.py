# Les bibliothèques officielles ne publient pas de stubs : règles levées pour ce seul fichier.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false, reportUnknownVariableType=false
"""Reprise d'une surface A2UI invalide avant le repli (KAN-96).

La boucle est celle de la bibliothèque (``run_a2ui_generation_with_recovery`` d'``ag-ui-a2ui-toolkit``, appelée par
``generate_a2ui``) : elle valide chaque essai du sous-agent contre notre catalogue fermé, lui renvoie les erreurs et ne
laisse peindre qu'une surface valide. Ces tests la rejouent avec le vrai catalogue de l'ERP et un sous-agent simulé.
"""

import json
from typing import Any

from ag_ui_a2ui_toolkit import run_a2ui_generation_with_recovery

from staport_ia.agent import _parametres_a2ui  # pyright: ignore[reportPrivateUsage]

CATALOGUE: dict[str, Any] = _parametres_a2ui()["catalog"]
VALIDE: dict[str, Any] = {"components": [{"id": "root", "component": "Text", "text": "Effectif : 150"}], "data": {}}
# Composant hors catalogue fermé (une jauge n'existe pas) : refusé par la validation.
INVALIDE: dict[str, Any] = {"components": [{"id": "root", "component": "Jauge", "valeur": 3}], "data": {}}
# Composant de l'ERP sans ses propriétés obligatoires (colonnes et lignes).
INCOMPLET: dict[str, Any] = {"components": [{"id": "root", "component": "DataTable"}], "data": {}}
# Composant du catalogue de base sans son texte : propriété obligatoire dans `allOf` (`_avec_requis_a_la_racine`).
TEXTE_VIDE: dict[str, Any] = {"components": [{"id": "root", "component": "Text"}], "data": {}}


def _jouer(essais: list[dict[str, Any]], maximum: int = 3) -> tuple[dict[str, Any], list[str]]:
    invites: list[str] = []

    def sous_agent(invite: str, numero: int) -> dict[str, Any]:
        invites.append(invite)
        return essais[min(numero, len(essais)) - 1]

    resultat = run_a2ui_generation_with_recovery(
        base_prompt="Présente l'effectif.",
        invoke_subagent=sous_agent,
        build_envelope=lambda args: json.dumps({"surface": args["components"]}),
        catalog=CATALOGUE,
        config={"maxAttempts": maximum},
    )
    return resultat, invites


def test_une_surface_valide_passe_du_premier_coup() -> None:
    resultat, invites = _jouer([VALIDE])

    assert resultat["ok"] is True
    assert len(invites) == 1


def test_une_surface_invalide_est_reprise_avec_les_erreurs_puis_acceptee() -> None:
    resultat, invites = _jouer([INVALIDE, VALIDE])

    assert resultat["ok"] is True
    assert [essai["ok"] for essai in resultat["attempts"]] == [False, True]
    assert "Previous attempt was invalid" in invites[1]
    assert "Jauge" in invites[1]  # le sous-agent apprend ce qu'il a mal fait
    assert "Jauge" not in resultat["envelope"]  # seule la surface valide est livrée


def test_une_propriete_obligatoire_manquante_est_reprise() -> None:
    resultat, _ = _jouer([INCOMPLET, VALIDE])

    assert resultat["ok"] is True
    assert resultat["attempts"][0]["ok"] is False


def test_apres_trois_essais_invalides_aucune_surface_n_est_livree_et_le_repli_prend_le_relais() -> None:
    resultat, invites = _jouer([INVALIDE])

    assert resultat["ok"] is False
    assert len(invites) == 3  # l'essai initial et deux reprises, pas davantage
    echec = json.loads(resultat["envelope"])
    assert echec["code"] == "a2ui_recovery_exhausted"
    assert "surface" not in echec  # rien à peindre : la réponse reste le texte de l'agent


def test_une_propriete_obligatoire_du_catalogue_de_base_est_aussi_reprise() -> None:
    resultat, invites = _jouer([TEXTE_VIDE, VALIDE])

    assert resultat["ok"] is True
    assert resultat["attempts"][0]["ok"] is False
    assert "text" in invites[1]

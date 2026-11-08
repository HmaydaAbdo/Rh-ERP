"""Mémoire du parc matériel par mois de paie (KAN-229) : conservation, remplacement explicite, nouvelle ligne."""

from typing import Any

from conftest import ADMIN, Plateforme


def _entetes(connecter: Any) -> dict[str, str]:
    return {"Authorization": f"Bearer {connecter(*ADMIN)['accessToken']}"}


def _exporter(plateforme: Plateforme, entetes: dict[str, str], periode: str, materiel: dict[str, int] | None) -> None:
    reponse = plateforme.client.post(
        "/paie/export", headers=entetes, json={"periode": periode, "feuillesEquipeMode": "AUCUNE", "materiel": materiel}
    )
    assert reponse.status_code == 200, reponse.text


def _valeurs(plateforme: Plateforme, entetes: dict[str, str], periode: str) -> dict[str, tuple[int, str]]:
    reponse = plateforme.client.get(f"/paie/materiel/valeurs?periode={periode}", headers=entetes)
    assert reponse.status_code == 200, reponse.text
    return {x["libelle"]: (x["quantite"], x["periode"]) for x in reponse.json()}


def test_le_materiel_saisi_est_propose_aux_mois_suivants(plateforme: Plateforme, connecter: Any) -> None:
    entetes = _entetes(connecter)
    assert _valeurs(plateforme, entetes, "2997-01") == {}

    # Nouveau matériel : un 0 explicite est mémorisé, une ligne absente ne crée rien.
    _exporter(plateforme, entetes, "2997-01", {"PICK UP": 3, "BULL": 0})
    assert _valeurs(plateforme, entetes, "2997-02") == {"BULL": (0, "2997-01"), "PICK UP": (3, "2997-01")}

    # Valeur existante conservée quand le mois suivant n'en fournit pas ; remplacée seulement si elle est fournie.
    _exporter(plateforme, entetes, "2997-02", {"PICK UP": 5})
    assert _valeurs(plateforme, entetes, "2997-02") == {"BULL": (0, "2997-01"), "PICK UP": (5, "2997-02")}
    assert _valeurs(plateforme, entetes, "2997-03") == {"BULL": (0, "2997-01"), "PICK UP": (5, "2997-02")}

    # Le remplacement n'a pas réécrit le passé.
    assert _valeurs(plateforme, entetes, "2997-01") == {"BULL": (0, "2997-01"), "PICK UP": (3, "2997-01")}

    # Resaisir le même mois remplace sa valeur ; un export sans matériel ou avec une ligne inconnue ne change rien.
    _exporter(plateforme, entetes, "2997-02", {"PICK UP": 6, "INCONNU": 9})
    _exporter(plateforme, entetes, "2997-02", None)
    assert _valeurs(plateforme, entetes, "2997-03") == {"BULL": (0, "2997-01"), "PICK UP": (6, "2997-02")}


def test_la_lecture_de_la_memoire_exige_le_droit_d_export(plateforme: Plateforme) -> None:
    assert plateforme.client.get("/paie/materiel/valeurs?periode=2997-01").status_code == 401

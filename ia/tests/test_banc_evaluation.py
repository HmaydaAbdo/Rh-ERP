# LangGraph, LangChain et leurs intégrations ne publient pas de stubs complets : seules ces règles sont levées.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false, reportUnknownVariableType=false
"""Banc d'évaluation : le jeu de référence rejoué par pytest sur le vrai agent (KAN-76, remplace le lanceur maison).

Un cas = un test paramétré (``-k <id>`` pour en rejouer un, ``IA_EVALUATION_REPETITIONS`` pour la stabilité pass^k).
Le banc ne s'exécute que lancé par ``api/tests/test_ia_lanceurs.py`` (variables ``EVAL_*`` et ``IA_LITELLM_*``, voir
``staport_ia.evaluation``) ; sans elles, il est ignoré. Le rapport JSON (``EVAL_RAPPORT``) n'écrit ni jeton ni clé.
"""

import json
import os
import time
from collections.abc import Iterator
from dataclasses import asdict
from pathlib import Path
from typing import Any

import httpx
import pytest

from staport_ia.evaluation import JEU, ResultatCas, cause, contexte_depuis_env, evaluer_cas, synthese

pytestmark = pytest.mark.skipif(
    "EVAL_API_URL" not in os.environ, reason="banc d'évaluation : variables EVAL_* absentes"
)

REPETITIONS = max(1, int(os.environ.get("IA_EVALUATION_REPETITIONS", "1")))
_JEU: dict[str, Any] = json.loads(JEU.read_text(encoding="utf-8"))
CAS = [(cas, n) for cas in _JEU["cas"] for n in range(1, REPETITIONS + 1)]
RESULTATS: list[ResultatCas] = []


@pytest.fixture(scope="module", autouse=True)
def rapport() -> Iterator[None]:
    """Écrit le rapport (synthèse et résultats) une fois tous les cas joués, réussis ou non."""
    yield
    if RESULTATS:
        chemin = Path(os.environ.get("EVAL_RAPPORT", "evaluation-ia.json"))
        chemin.parent.mkdir(parents=True, exist_ok=True)
        bilan = {"jeu": _JEU["version"], "synthese": synthese(RESULTATS), "resultats": [asdict(r) for r in RESULTATS]}
        chemin.write_text(json.dumps(bilan, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(bilan["synthese"], ensure_ascii=False))


@pytest.mark.parametrize(("cas", "numero"), CAS, ids=[f"{c['id']}#{n}" for c, n in CAS])
async def test_le_cas_du_jeu_de_reference_reussit(cas: dict[str, Any], numero: int) -> None:
    debut = time.monotonic()
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            resultat = await evaluer_cas(cas, contexte_depuis_env(client), numero)
        except Exception as panne:  # un cas en panne est un échec mesuré, pas un arrêt du banc
            resultat = ResultatCas(
                cas["id"],
                str(cas.get("type", "reponse")),
                False,
                f"panne : {cause(panne)}",
                round(time.monotonic() - debut, 2),
                repetition=numero,
            )
    RESULTATS.append(resultat)
    assert resultat.succes, resultat.raison


@pytest.mark.skipif(
    os.environ.get("IA_EVALUATION_SEUILS") != "1", reason="seuils d'acceptation : IA_EVALUATION_SEUILS=1"
)
def test_le_jeu_de_reference_atteint_les_seuils_d_acceptation() -> None:
    bilan = synthese(RESULTATS)
    assert bilan["acceptee"], bilan["acceptation"]

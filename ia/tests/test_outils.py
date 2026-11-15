"""Lecture de la ressource MCP de contexte (KAN-72) : une panne ne bloque jamais la question."""

from staport_ia.outils import contexte_erp


async def test_une_api_injoignable_donne_un_contexte_vide() -> None:
    # Port fermé : la connexion échoue, le service continue avec une instruction plus courte.
    assert await contexte_erp("http://127.0.0.1:9/mcp", "jeton", delai_secondes=2.0) == ""

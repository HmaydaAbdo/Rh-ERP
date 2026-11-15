"""Ressource MCP `erp://contexte` (KAN-72) : ce que l'ERP sait déjà au moment de la question.

Sans elle, presque chaque question de l'assistant commence par deux appels de modèle pour apprendre la date du jour
et le dernier mois de paie importé. C'est une ressource, donc une donnée que l'application lit, et non un outil que le
modèle choisit d'appeler : le service IA la lit une fois au début de chaque exécution et la place dans l'instruction.
Elle est calculée avec le jeton et les droits de l'appelant, relus en base à chaque requête : le mois de paie n'y figure
que pour qui détient `PAIE_READ`. Aucune donnée RH n'y figure.
"""

from collections.abc import Callable
from datetime import date

from fastmcp import FastMCP
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from staport.domains.auth.composition import ContexteAuth
from staport.domains.auth.securite import SCOPE_LECTURE
from staport.domains.mcp.acces import exiger_permission
from staport.domains.paie.periode import afficher_periode

URI = "erp://contexte"


def enregistrer(
    serveur: FastMCP, contexte: Callable[[], ContexteAuth], fabrique: Callable[[], async_sessionmaker[AsyncSession]]
) -> None:
    """Déclare la ressource sur `serveur` ; contexte et fabrique de sessions sont demandés à chaque lecture."""

    @serveur.resource(
        URI,
        name="contexte",
        title="Contexte du moment",
        description="Date du jour et dernier mois de paie importé (si l'utilisateur voit la paie).",
        mime_type="text/plain",
    )
    async def contexte_du_moment() -> str:  # pyright: ignore[reportUnusedFunction]
        jeton = exiger_permission(SCOPE_LECTURE)
        lignes = [f"Date du jour : {date.today().isoformat()}."]
        if "PAIE_READ" in jeton.scopes:
            async with fabrique()() as session:
                dernier = await contexte().paies.derniere_periode(session)
            if dernier is not None:
                lignes.append(
                    f"Dernier mois de paie importé : {afficher_periode(dernier)} ; c'est le mois par défaut de tous "
                    "les outils de paie et d'employés, ne cherche pas à le connaître."
                )
        return "\n".join(lignes)

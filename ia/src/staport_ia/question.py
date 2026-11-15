# LangGraph et LangChain ne publient pas de stubs complets : seules ces règles sont levées, pour ce fichier.
# pyright: reportMissingTypeStubs=false, reportUnknownVariableType=false, reportUnknownMemberType=false
"""Question de l'agent à l'utilisateur, par l'interruption native de LangGraph (KAN-264).

``poser_question`` n'est plus un outil déclaré par le navigateur (human-in-the-loop de CopilotKit) : l'outil vit côté
agent et appelle ``interrupt()``, comme l'accord avant écriture (``agent.py``). Le run s'arrête, le point de reprise est
dans le checkpointer PostgreSQL (il survit à un redémarrage), et la réponse revient par la reprise AG-UI
(``resume``) ; le navigateur n'a plus à renvoyer un message d'outil. La valeur de l'interruption porte le type
``question`` pour que l'interface distingue la question de l'accord d'écriture.
"""

from typing import Annotated

from langchain_core.tools import tool
from langgraph.types import interrupt
from pydantic import BaseModel, Field

OUTIL_QUESTION = "poser_question"
OPTIONS_MIN, OPTIONS_MAX = 2, 5
REPONSE_MAX = 500


class Option(BaseModel):
    label: Annotated[str, Field(description="Texte court de l'option.", max_length=80)]
    description: Annotated[str | None, Field(description="Précision facultative.", max_length=160)] = None


@tool(OUTIL_QUESTION)
def poser_question(
    question: Annotated[str, Field(description="La question, en français, courte et précise.", max_length=300)],
    options: Annotated[
        list[Option], Field(description="Les réponses proposées.", min_length=OPTIONS_MIN, max_length=OPTIONS_MAX)
    ],
    multiple: Annotated[bool, Field(description="Vrai si plusieurs options peuvent être choisies.")] = False,
) -> str:
    """Pose une question à l'utilisateur et attend sa réponse. À utiliser quand la demande est ambiguë ou qu'un choix
    change le résultat (période, périmètre, critère de classement, sens du mot « entrées »…), plutôt que de deviner.
    Donne 2 à 5 options courtes et distinctes ; l'utilisateur peut aussi répondre librement. Ne l'utilise jamais pour
    une valeur qu'une application connectée peut donner, ni pour une salutation."""
    reponse = interrupt(
        {
            "type": "question",
            "question": question,
            "options": [o.model_dump(exclude_none=True) for o in options],
            "multiple": multiple,
        }
    )
    return str(reponse)[:REPONSE_MAX]

# LangGraph ne publie pas de stubs et laisse des génériques inconnus (CachePolicy) dans ses signatures :
# seules ces deux règles sont levées, et seulement pour ce fichier.
# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false
"""Graphe de l'agent (docs/ia.md, T6) : préparer → cibler les domaines → choisir des outils ⇄ les exécuter → rédiger →
vérifier les chiffres.

Le ciblage (petit modèle, tag ``simple``) ne transmet au modèle que les outils des domaines utiles, aucun d'office ;
s'il échoue, tout le catalogue part (masquer n'est pas un contrôle d'accès : Spring revérifie chaque appel).
Explicite et borné : nombre de tours d'outils, d'appels et de rédactions plafonnés ; un refus d'autorisation n'est
jamais retenté ; une réponse dont un nombre ne vient pas des outils est réécrite une fois puis remplacée par une
abstention. Le graphe n'a pas de mémoire durable : chaque question est un run indépendant.
"""

import json
from dataclasses import dataclass
from typing import Any, Literal, NotRequired, TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.runtime import Runtime
from pydantic import BaseModel

from erp_rh_ia.domaines import domaines_du_catalogue, restreindre
from erp_rh_ia.modele import AppelOutil, Brouillon, Modele
from erp_rh_ia.outils import OutilDecrit, Outils, ResultatOutil
from erp_rh_ia.verification import verifier

SYSTEME = """Tu es l'assistant RH d'ERP-RH, l'ERP d'une entreprise du BTP au Maroc.
Règles impératives :
1. Toute valeur (effectif, montant, date, nombre, nom) vient d'un outil. N'invente jamais.
2. Ne calcule rien : ni somme, ni différence, ni moyenne, ni pourcentage. Reprends les valeurs telles que les outils les
   donnent, avec leur période.
3. Si les outils ne donnent pas l'information, dis-le simplement.
4. Si un outil répond « Accès refusé », dis à l'utilisateur qu'il n'a pas ce droit ; ne contourne pas le refus.
5. Pour un chantier, une équipe ou une fonction cité par son nom ou son code, cherche d'abord son identifiant avec
   l'outil de recherche du référentiel, puis utilise cet identifiant.
6. Une valeur de la forme AAAA-MM (par exemple 2026-09) est une période de paie, quelle que soit l'année : passe-la
   telle quelle en paramètre « periode ». Ce n'est jamais un code de chantier, d'équipe ou de fonction.
7. Réponds en français, brièvement. Les montants sont en dirhams (MAD)."""

CONSIGNE_REDACTION = """Rédige maintenant la réponse finale, en JSON uniquement :
- "reponse" : le texte pour l'utilisateur ;
- "vue" : le numéro de la vue à proposer parmi la liste ci-dessous, ou null ;
- "abstention" : true si les données des outils ne permettent pas de répondre.
N'écris aucun nombre qui ne figure pas dans les résultats des outils.
Vues disponibles :
{vues}"""

CONSIGNE_CIBLAGE = """Tu classes la question d'un utilisateur d'ERP-RH (RH d'une entreprise du BTP au Maroc).
Réponds en JSON {{"domaines": [...]}} avec tous les domaines dont les données peuvent servir à répondre ;
en cas de doute, ajoute le domaine. Liste vide si la question ne relève d'aucun domaine.
Une valeur AAAA-MM (par exemple 2026-09) est une période de paie, jamais un code de chantier, d'équipe ou de fonction.
Domaines :
{domaines}"""

ABSTENTION = (
    "Je ne peux pas répondre de façon fiable avec les données disponibles. Ouvrez l'écran correspondant pour vérifier."
)

Motif = Literal["SANS_DONNEES", "CHIFFRES_NON_VERIFIES", "SORTIE_INVALIDE"]


@dataclass(frozen=True)
class Limites:
    tours: int = 3
    appels: int = 6
    redactions: int = 2
    taille_resultat: int = 12_000


class ReponseAgent(BaseModel):
    texte: str
    abstention: bool
    motif: Motif | None = None
    vue: dict[str, Any] | None = None
    outils: list[str]
    nombres_inconnus: list[str] = []
    domaines: list[str] | None = None  # None : ciblage indisponible, catalogue complet


@dataclass(frozen=True)
class Contexte:
    outils: Outils


class Entree(TypedDict):
    question: str


class Etat(TypedDict):
    """État d'un run ; les clés obligatoires sont posées par ``preparer``, les facultatives en cours de route."""

    question: str
    messages: list[dict[str, Any]]
    catalogue: list[OutilDecrit]
    domaines: list[str] | None
    appels: list[AppelOutil]
    resultats: list[ResultatOutil]
    tours: int
    redactions: int
    brouillon: NotRequired[Brouillon]
    inconnus: NotRequired[list[str]]
    reponse: NotRequired[ReponseAgent]


Maj = dict[str, Any]


class Agent:
    def __init__(self, modele: Modele, limites: Limites | None = None) -> None:
        self._modele = modele
        self._limites = limites or Limites()
        graphe = StateGraph(Etat, input_schema=Entree, context_schema=Contexte)
        graphe.add_node("preparer", self._preparer)
        graphe.add_node("cibler", self._cibler)
        graphe.add_node("choisir", self._choisir)
        graphe.add_node("executer", self._executer)
        graphe.add_node("rediger", self._rediger)
        graphe.add_node("verifier", self._verifier)
        graphe.add_edge(START, "preparer")
        graphe.add_edge("preparer", "cibler")
        graphe.add_edge("cibler", "choisir")
        graphe.add_conditional_edges("choisir", self._apres_choix, ["executer", "rediger"])
        graphe.add_conditional_edges("executer", self._apres_execution, ["choisir", "rediger"])
        graphe.add_edge("rediger", "verifier")
        graphe.add_conditional_edges("verifier", self._apres_verification, ["rediger", END])
        self._graphe = graphe.compile()

    async def repondre(self, question: str, outils: Outils) -> ReponseAgent:
        etat = await self._graphe.ainvoke(
            {"question": question}, context=Contexte(outils), config={"recursion_limit": 40}
        )
        reponse = etat.get("reponse")
        if not isinstance(reponse, ReponseAgent):
            return ReponseAgent(texte=ABSTENTION, abstention=True, motif="SORTIE_INVALIDE", outils=[])
        return reponse.model_copy(update={"domaines": etat.get("domaines")})

    # --- nœuds ---

    async def _preparer(self, state: Entree, runtime: Runtime[Contexte]) -> Maj:
        etat = state
        catalogue = await runtime.context.outils.lister()
        messages = [{"role": "system", "content": SYSTEME}, {"role": "user", "content": etat["question"]}]
        return {
            "catalogue": catalogue,
            "domaines": None,
            "messages": messages,
            "resultats": [],
            "tours": 0,
            "redactions": 0,
            "appels": [],
        }

    async def _cibler(self, state: Etat) -> Maj:
        """Ne garde que les outils des domaines utiles ; un ciblage invalide laisse tout le catalogue."""
        etat = state
        presents = domaines_du_catalogue(etat["catalogue"])
        if not presents:
            return {}
        liste = "\n".join(f"- {d.nom} : {d.description}" for d in presents)
        messages = [
            {"role": "system", "content": CONSIGNE_CIBLAGE.format(domaines=liste)},
            {"role": "user", "content": etat["question"]},
        ]
        domaines = await self._modele.cibler(messages, [d.nom for d in presents])
        if domaines is None:
            return {}
        return {"domaines": domaines, "catalogue": restreindre(etat["catalogue"], domaines)}

    async def _choisir(self, state: Etat) -> Maj:
        etat = state
        restant = self._limites.appels - len(etat["resultats"])
        choix = await self._modele.choisir(etat["messages"], etat["catalogue"])
        appels = choix.appels[: max(restant, 0)]
        if not appels:
            return {"appels": []}
        message = {
            "role": "assistant",
            # Chaîne vide plutôt que null : Workers AI refuse un contenu null (400), OpenAI accepte les deux.
            "content": choix.texte,
            "tool_calls": [
                {
                    "id": a.identifiant,
                    "type": "function",
                    "function": {"name": a.nom, "arguments": json.dumps(a.arguments, ensure_ascii=False)},
                }
                for a in appels
            ],
        }
        return {"appels": appels, "messages": [*etat["messages"], message]}

    async def _executer(self, state: Etat, runtime: Runtime[Contexte]) -> Maj:
        etat = state
        connus = {o.nom for o in etat["catalogue"]}
        refuses = {r.outil for r in etat["resultats"] if r.refuse}
        messages = list(etat["messages"])
        resultats = list(etat["resultats"])
        for appel in etat["appels"]:
            if appel.nom not in connus:
                resultat = ResultatOutil(appel.nom, appel.arguments, True, f"Outil inconnu : {appel.nom}.")
            elif appel.nom in refuses:
                resultat = ResultatOutil(appel.nom, appel.arguments, True, "Accès refusé : déjà signalé.")
            else:
                resultat = await runtime.context.outils.appeler(appel.nom, appel.arguments)
            resultats.append(resultat)
            messages.append({"role": "tool", "tool_call_id": appel.identifiant, "content": self._contenu(resultat)})
        return {"resultats": resultats, "messages": messages, "tours": etat["tours"] + 1, "appels": []}

    async def _rediger(self, state: Etat) -> Maj:
        etat = state
        vues = self._vues(etat["resultats"])
        liste = "\n".join(f"{i} : {json.dumps(v, ensure_ascii=False)}" for i, v in enumerate(vues)) or "(aucune)"
        consigne = {"role": "user", "content": CONSIGNE_REDACTION.format(vues=liste)}
        messages = [*etat["messages"], consigne]
        inconnus = etat.get("inconnus", [])
        if inconnus:
            messages.append(
                {
                    "role": "user",
                    "content": "Ta réponse précédente contenait des nombres absents des outils : "
                    + ", ".join(inconnus)
                    + ". Réécris-la en ne reprenant que des valeurs des outils.",
                }
            )
        brouillon = await self._modele.rediger(messages)
        return {"brouillon": brouillon, "redactions": etat["redactions"] + 1}

    def _verifier(self, state: Etat) -> Maj:
        etat = state
        brouillon = etat.get("brouillon")
        if brouillon is None:
            return {"reponse": ReponseAgent(texte=ABSTENTION, abstention=True, motif="SORTIE_INVALIDE", outils=[])}
        outils = [r.outil for r in etat["resultats"]]
        if not brouillon.reponse.strip() and etat["redactions"] < self._limites.redactions:
            return {"inconnus": []}  # sortie invalide : une nouvelle rédaction, souvent servie par un autre modèle
        if brouillon.abstention or not brouillon.reponse.strip():
            motif: Motif = "SANS_DONNEES" if brouillon.reponse.strip() else "SORTIE_INVALIDE"
            texte = brouillon.reponse.strip() or ABSTENTION
            return {"reponse": ReponseAgent(texte=texte, abstention=True, motif=motif, outils=outils)}
        sources: list[Any] = [r.donnees for r in etat["resultats"] if not r.est_erreur]
        sources += [r.texte for r in etat["resultats"]]
        verification = verifier(brouillon.reponse, sources, etat["question"])
        if verification.conforme:
            vues = self._vues(etat["resultats"])
            vue = vues[brouillon.vue] if brouillon.vue is not None and 0 <= brouillon.vue < len(vues) else None
            return {"reponse": ReponseAgent(texte=brouillon.reponse, abstention=False, vue=vue, outils=outils)}
        if etat["redactions"] < self._limites.redactions:
            return {"inconnus": list(verification.nombres_inconnus)}
        return {
            "reponse": ReponseAgent(
                texte=ABSTENTION,
                abstention=True,
                motif="CHIFFRES_NON_VERIFIES",
                outils=outils,
                nombres_inconnus=list(verification.nombres_inconnus),
            )
        }

    # --- routage ---

    @staticmethod
    def _apres_choix(etat: Etat) -> str:
        return "executer" if etat["appels"] else "rediger"

    def _apres_execution(self, etat: Etat) -> str:
        fin = (
            any(r.refuse for r in etat["resultats"])
            or etat["tours"] >= self._limites.tours
            or len(etat["resultats"]) >= self._limites.appels
        )
        return "rediger" if fin else "choisir"

    @staticmethod
    def _apres_verification(etat: Etat) -> str:
        return END if "reponse" in etat else "rediger"

    # --- utilitaires ---

    def _contenu(self, resultat: ResultatOutil) -> str:
        valeur: dict[str, Any] = (
            {"erreur": resultat.texte} if resultat.est_erreur else (resultat.donnees or {"texte": resultat.texte})
        )
        texte = json.dumps(valeur, ensure_ascii=False, default=str)
        return texte[: self._limites.taille_resultat]

    @staticmethod
    def _vues(resultats: list[ResultatOutil]) -> list[dict[str, Any]]:
        vues: list[dict[str, Any]] = []
        for resultat in resultats:
            vue = resultat.donnees.get("vue")
            if not resultat.est_erreur and isinstance(vue, dict):
                vues.append(vue)  # pyright: ignore[reportUnknownArgumentType]
        return vues

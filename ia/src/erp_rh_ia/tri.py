"""Tri des messages sans donnée (docs/ia.md, T3.5) : salutation, remerciement, au revoir ou demande d'aide.

Déterministe et sans modèle : un tel message reçoit sa réponse aussitôt, sans ciblage, outil ni rédaction. Seul un
message composé uniquement de mots de politesse est retenu ; « bonjour, quelle est la masse salariale ? » suit le
parcours complet. Les réponses ne contiennent aucun chiffre : le vérificateur n'a rien à contrôler.
"""

import re
import unicodedata
from typing import Literal

Sorte = Literal["salutation", "remerciement", "au_revoir", "aide"]

# Mots qui, seuls ou ensemble, ne demandent aucune donnée (français, anglais, darija en lettres latines, arabe).
_SALUTATIONS = {
    "bonjour", "bonsoir", "salut", "coucou", "hello", "hi", "hey", "salam", "slm", "salamou", "alaykoum",
    "alaikoum", "aleykoum", "ahlan", "marhba", "sbah", "msa", "lkhir", "lkher", "labas", "مرحبا", "السلام",
    "عليكم", "اهلا", "أهلا", "صباح", "مساء", "الخير", "سلام",
}  # fmt: skip
_REMERCIEMENTS = {"merci", "thanks", "thank", "thx", "choukran", "chokran", "shukran", "barak", "شكرا", "بارك"}
_AU_REVOIR = {"revoir", "bye", "bientot", "bslama", "beslama", "ciao", "بسلامة", "السلامة"}
# Mots d'accompagnement admis autour des précédents (« bonjour assistant », « merci beaucoup », « ça va ? »).
_LIANTS = {
    "au", "a", "ca", "va", "vas", "comment", "tu", "vous", "allez", "beaucoup", "bien", "bonne", "journee",
    "soiree", "assistant", "staport", "you", "very", "much", "lot", "allah", "fik", "fikoum", "lah", "la", "le",
    "les", "et", "toi", "how", "are", "jazil", "tous", "toutes", "ok", "مع", "فيك", "الله", "جزيلا",
}  # fmt: skip
_AIDE = {
    "aide", "help", "que sais tu faire", "que peux tu faire", "tu sais faire quoi", "tu peux faire quoi",
    "qui es tu", "comment ca marche", "comment tu marches", "what can you do", "que fais tu",
}  # fmt: skip

REPONSES: dict[Sorte, str] = {
    "salutation": (
        "Bonjour ! Je réponds à vos questions sur les employés, la paie, les chantiers, les équipes et les fonctions, "
        "avec des chiffres lus dans l'ERP et vérifiés, puis j'ouvre la vue correspondante. Par exemple : « Quelle est "
        "la masse salariale du dernier mois de paie ? »"
    ),
    "remerciement": "Avec plaisir. Avez-vous une autre question ?",
    "au_revoir": "Au revoir, à bientôt.",
    "aide": (
        "Je réponds aux questions sur les employés, la paie, les chantiers, les équipes, les fonctions, les paramètres "
        "et le journal d'audit, dans la limite de vos droits. Chaque chiffre vient de l'ERP et il est vérifié avant "
        "affichage ; j'ouvre ensuite la vue filtrée. Je ne modifie aucune donnée et je dis quand je ne sais pas. "
        "Exemples : « Combien d'employés sont en poste ? », « Masse salariale par chantier du dernier mois »."
    ),
}


def trier(message: str) -> Sorte | None:
    """La sorte d'un message sans donnée, ou ``None`` s'il doit suivre le parcours complet."""
    texte = _normaliser(message)
    if not texte or len(texte) > 80:
        return None
    if texte in _AIDE:
        return "aide"
    mots = texte.split()
    sortes: list[Sorte] = []
    for mot in mots:
        if mot in _SALUTATIONS:
            sortes.append("salutation")
        elif mot in _REMERCIEMENTS:
            sortes.append("remerciement")
        elif mot in _AU_REVOIR:
            sortes.append("au_revoir")
        elif mot not in _LIANTS:
            return None
    if not sortes:
        return None
    # « merci, au revoir » : on prend congé ; « bonjour, merci » : on remercie.
    for sorte in ("au_revoir", "remerciement", "salutation"):
        if sorte in sortes:
            return sorte
    return None


def _normaliser(message: str) -> str:
    """Minuscules, sans signes diacritiques (accents latins, hamza et voyelles arabes) ni ponctuation."""
    decompose = unicodedata.normalize("NFKD", message.lower())
    sans_signes = "".join(c for c in decompose if not unicodedata.combining(c))
    sans_ponctuation = re.sub(r"[^\w\s]", " ", sans_signes)
    return " ".join(sans_ponctuation.replace("_", " ").split())

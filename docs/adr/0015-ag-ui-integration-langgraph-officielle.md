# ADR 0015 — AG-UI par l'intégration LangGraph officielle, encore en 0.0.x

- **Statut** : accepté
- **Date** : 2026-10-25
- **Décideur** : propriétaire du projet

## Contexte

Le service IA expose l'agent LangGraph au navigateur par AG-UI (docs/ia.md, T7). Un premier adaptateur maison, écrit sur
le SDK stable `ag-ui-protocol` 1.0.0, a validé le contrat d'événements. L'intégration officielle `ag-ui-langgraph`
(`LangGraphAgent`) reste publiée en 0.0.x ; `conventions/agent-ui.md` demande un ADR accepté avant d'en faire un contrat
de production. Le propriétaire veut s'appuyer sur l'intégration officielle dès T8 plutôt que maintenir un adaptateur.

## Décision

1. Le flux AG-UI est produit par `ag-ui-langgraph` 0.0.47, version exacte figée par `ia/uv.lock` ; le client du
   navigateur est le client officiel `@ag-ui/client`.
2. Le module `ia/src/erp_rh_ia/agui.py` garde ce que l'intégration ne fait pas : identité (jeton de connexion échangé
   auprès de Spring, refus HTTP avant tout flux), session MCP par run et frontière de sécurité sur les événements :
   - `emit_raw_events=False`, événements `RAW` et copies `rawEvent` retirés (ils porteraient l'état interne) ;
   - `RUN_ERROR` remplacé par un message générique (l'intégration recopie le texte de l'exception) et journal de
     l'intégration sans trace d'exception ;
   - échos `manually_emit_*` retirés ; séquence et corrélation ajoutées à l'événement de mascotte.
3. Le graphe ne montre au navigateur que sa clé de sortie `messages` (conversation LangChain : question, appels,
   synthèse des résultats, réponse). Les consignes, l'échange interne avec le modèle et les données complètes des outils
   restent dans l'état privé.
4. Les modèles ne sont pas appelés par LangChain : aucun jeton n'est diffusé pendant la génération. Le texte part une seule
   fois, vérifié par le contrôle des chiffres, depuis le nœud `conclure` (`manually_emit_message`).
5. L'intégration exige un checkpointer : un `InMemorySaver` neuf par run, oublié à la fin, avec la liste blanche de nos
   types d'état. Les checkpoints durables arrivent avec les écritures et les confirmations (J6).

## Conséquences

- Chaque mise à niveau de `ag-ui-langgraph` est une évolution de contrat : relancer `tests/test_agui.py` (ordre des
  événements, absence de fuite) et `FluxAgUiIntegrationTest` avec le client officiel avant de la retenir.
- Dépendances ajoutées au service IA : `langchain-core`, `langchain` et `ag-ui-a2ui-toolkit` (tirées par l'intégration).
  Spring reste sans framework LLM.
- Les résultats d'outils n'arrivent plus en `TOOL_CALL_RESULT` mais dans `MESSAGES_SNAPSHOT`, comme le prévoit
  l'intégration pour des outils appelés hors LangChain.
- Retour possible à l'adaptateur sur le SDK stable sans changer le client : le contrat d'événements reste celui de
  `docs/ia.md`.

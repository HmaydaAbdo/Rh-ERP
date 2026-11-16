---
title: Les trois mémoires de l'assistant
sidebar_position: 10
---

# Les trois mémoires de l'assistant

Décision KAN-86 (épopée E11), appuyée sur la mémoire longue de KAN-84 et la reprise du flux de KAN-85. L'assistant a trois mémoires de nature différente. Elles ne se mélangent jamais : chacune a son propriétaire, sa durée de vie, son stockage et son code de suppression.

| | État du fil | Mémoire inter-fils | Contexte d'exécution |
|---|---|---|---|
| **Ce que c'est** | Le contenu d'une conversation : messages, plan (`todos`), compétences épinglées, résumé | Ce que l'assistant retient de l'utilisateur d'une conversation à l'autre, et ses fichiers | Ce que le service fournit à un run : date du jour, droits, capacités |
| **Mécanisme officiel** | Checkpointer LangGraph (`AsyncPostgresSaver`) | Store LangGraph (`AsyncPostgresStore`), paramètre `memory` de Deep Agents | `context_schema` de LangGraph (`ContexteRun`) |
| **Propriétaire** | La conversation de l'utilisateur (`<utilisateur>:<fil>`) | L'utilisateur : espaces de noms `(<utilisateur>, "memoire")` et `(<utilisateur>, "espace")` | Le run, jamais le modèle ni le navigateur |
| **Qui écrit** | Le graphe, à chaque étape | L'utilisateur (panneau), ou l'agent **avec l'accord de l'utilisateur** | Le service, avant le run ; lecture seule ensuite |
| **Durée de vie** | Jusqu'à la suppression de la conversation ou `IA_CONVERSATION_JOURS` jours d'inactivité | Expiration native du Store (`TTLConfig`, même durée), ou oubli par l'utilisateur | Un run |
| **Suppression** | `adelete_thread` (KAN-81, KAN-82) | Panneau « Ce que l'assistant retient » : tout oublier | Rien à supprimer : jamais stocké |
| **Code** | `memoire.py`, `agui.py` | `souvenirs.py`, `fichiers.py`, `agent.py` | `agent.py` (`ContexteRun`), `agui.py` |

## Les règles de la frontière

- **L'état du fil n'est jamais la source de la mémoire inter-fils.** Le `MemoryMiddleware` officiel charge `AGENTS.md` une seule fois par conversation et le garde dans l'état du fil : un « tout oublier » ou une correction ne s'appliquerait pas aux conversations déjà commencées. `MemoireFraiche` relit donc le Store au début de chaque run (testé : `test_oublier_ou_corriger_s_applique_aussi_aux_conversations_deja_commencees`).
- **Supprimer une conversation ne touche ni la mémoire ni l'espace de l'utilisateur ; oublier la mémoire ne touche pas l'historique des conversations** (testé dans `test_memoires_separees.py`).
- **Le contexte d'exécution n'est ni écrit dans l'état du fil ni mémorisé** : `ContexteRun` ne contient que `contexte_erp`, fourni par le service (`get_stream_kwargs`), jamais par le navigateur. Le contexte d'écran du navigateur est un indice réécrit par le serveur (KAN-83), pas un contexte d'exécution.
- **La mémoire est un indice, jamais une autorité** : elle ne remplace pas les outils ni leurs droits. Une valeur métier (montant, effectif, nom) se relit avec l'outil ; un fait RH n'est retenu qu'avec l'accord explicite de la personne et reste soumis aux projections par champ.

## Mémoire longue (KAN-84)

- **Fichier unique** `/memoire/AGENTS.md`, passé au paramètre officiel `memory` de Deep Agents (toujours chargé dans le prompt), 4 000 caractères au plus ; le routage du `CompositeBackend` l'envoie dans le Store sous l'identité du jeton agent.
- **Consentement** : toute écriture de l'agent dans `/memoire/` est interrompue par la permission `interrupt` de Deep Agents ; la carte d'accord de l'interface montre le contenu avant l'écriture. Le prompt demande de proposer de retenir plutôt que de retenir en silence, et interdit les données personnelles sur une autre personne, les mots de passe et les valeurs lues dans un outil.
- **Consultation, correction, oubli** : le panneau « Ce que l'assistant retient » de l'assistant (routes `GET`, `PUT` et `DELETE /ia/memoire`, relayées par le runtime CopilotKit : le navigateur n'atteint pas le service IA). L'identité vient du jeton de connexion échangé par l'API, jamais d'un paramètre. Chaque modification est journalisée (chemin, taille, action ; jamais le contenu).
- **Expiration** : celle du Store (`TTLConfig`, balayeur natif) ; le Store en a donc un, contrairement à l'hypothèse du ticket. Chaque run relit la mémoire, ce qui prolonge sa durée : seule une longue inactivité l'efface.

## Reprise du flux (KAN-85)

Aucune voie officielle gratuite ne rattrape un flux coupé : AG-UI Streams (CopilotKit Intelligence) et `join/rejoin` du serveur d'agent LangGraph sont exclus (licences). Ce qui existe suffit pour ne jamais relancer l'agent :

- le run continue côté serveur quand le navigateur est coupé ; sa réponse arrive dans l'historique du fil ;
- le navigateur se rattache avec `connectAgent`, qui **rejoue** l'historique et ne lance rien (lecture) ;
- aucun relais ni client ne rejoue automatiquement un `POST` : nginx ne rejoue pas les requêtes non idempotentes et l'application n'a aucune logique de reprise automatique.

La preuve est dans `copilot-runtime/test/app.test.mjs` (« reconnexion du flux ») : après un run terminé, se rattacher deux fois ne déclenche aucune exécution du service IA ; après un flux coupé en cours de run, se rattacher livre la réponse avec **une seule** exécution. Si un besoin de rattrapage en direct est mesuré, le sujet se rouvre.

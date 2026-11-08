---
title: "Vision courte et vision longue"
sidebar_position: 5
---

:::note Page reprise de l'ancien document IA
Texte repris tel quel de `docs/ia.md` (mis à jour le 2026-11-06). Les mentions de Spring, de Java et des tâches T* décrivent l'état avant la bascule vers FastAPI : la source de vérité du suivi est Jira (projet `KAN`) et celle du comportement est le code. À actualiser épopée par épopée.
:::

## Vision courte et vision longue

Proposition du 2026-10-26, à amender par le propriétaire. La vision courte mène à la démonstration J1 ; la vision longue
suit les jalons J2 à J9 ci-dessus et ne change aucune décision du § 2.

**Vision courte (avant la démonstration J1)**

| Ordre | Sujet | Pourquoi | Mesure de réussite |
|---|---|---|---|
| 1 | **Latence des réponses** : une réponse avec surface A2UI est passée de 6 min à 76 s (4 appels de modèle) en retirant le schéma A2UI de chaque appel. Le paramètre global `reasoning_effort=low` a depuis été retiré : il provoquait une erreur 400 sur Gemma 4 via LiteLLM. Le routeur officiel LiteLLM utilise désormais les latences observées (fenêtre 10 min, marge 50 %) ; reste à mesurer son effet sur p95 et tenir sous 30 s | Les offres gratuites répondent de 0,5 à 80 s par appel et l'agent en enchaîne 4 à 10 | p50 et p95 par type de question dans le jeu de référence (§ 4.4) ; validation de routage par `test_providers.py` |
| 2 | **T18 Observabilité** | Impossible d'optimiser la latence sans voir le temps de chaque appel de modèle et d'outil | Une question se suit du clic à la base, appels de modèle et d'outils chronométrés |
| 3 | **T17 Passerelle native** | Garde-fous (injection de prompt, masquage), budgets et limites par utilisateur | Tests négatifs verts, budget par utilisateur appliqué |
| 4 | **T19 Conversations durables** | Reprise de fil et mémoire ; les surfaces A2UI et les réponses survivent à un rechargement | Fil repris après redémarrage du service |
| 5 | **Surface A2UI issue des outils** | La surface reprend les résultats déterministes des outils via le motif officiel A2UI | Les valeurs affichées proviennent des résultats d'outils et sont mesurées par le jeu de référence |
| 6 | **Pool de modèles** | LLM7 (`gpt-oss:20b`, `codestral-latest`) et Cohere (essai, en évaluation) ajoutés le 2026-10-26 ; SambaNova n'est plus gratuit. Aucun modèle local possible avec le matériel disponible | Un modèle rapide et fiable en outils pour le tag `complex`, validé par le jeu de référence |
| 7 | **Clôture des modules Équipe, Fonction, Chantier** | README et skills détaillés par couche ; points à valider listés dans chaque README | Réponses du propriétaire consignées, points classés |
| 8 | **T20 Démonstration J1** | Images reconstruites, banc réel, flux réels | Démonstration présentée |

**Vision longue**

| Horizon | Sujet | Détail |
|---|---|---|
| J2 | **Périmètres par fiche de poste** | Aujourd'hui toute permission donne accès à toutes les données du domaine ; le périmètre (chantiers, équipes, département) est appliqué dans Spring pour REST et MCP |
| J3 | **Pilote réel et modèle hébergé ou local** | Matériel limité : modèles ouverts servis par un fournisseur hébergé ; un abonnement payant minimal sera à arbitrer si les offres gratuites ne tiennent pas la charge ; accord CNDP déjà obtenu |
| J4 | **Espace IA immersif** | Plein écran, surfaces A2UI avec composants métier Staport (`createAngularCatalog`) : indicateurs, graphiques, tableaux ; mascotte Rive seulement si le propriétaire la confirme (la mascotte maison est retirée) |
| J5 à J7 | **Agents de domaine** | Passage à Deep Agents (`create_deep_agent`) quand le jeu de référence le justifie : contrôle de la paie, documents RH, assistant réglementaire. **Skills pour l'agent**, distincts des skills de développement : `ia/skills/<domaine>/SKILL.md` courts, dans la voix de l'agent, reprenant les définitions des README (une seule source) et chargés à la demande |
| J6 | **Premières écritures** | Diff, approbation humaine, idempotence, checkpoints durables ; jamais d'écriture sans confirmation |
| J7 | **Assistant réglementaire** | Corpus versionné (Code du travail, CNSS/AMO, barème IR), plein texte puis hybride pgvector, citations vérifiées |
| J8 | **Autres départements et A2A** | Mêmes portes que J1 à J3 par module ; SSO par Spring Authorization Server comme fournisseur d'identité si l'entreprise l'exige |
| J9 | **Terrain et voix** | Mobile chef de chantier, voix FR et darija |
| Transverse | **Qualité de la documentation** | Contrôle doc ↔ code en CI (`scripts/check-docs-domaines.mjs`) : chaque permission et chaque outil MCP figure dans la documentation de son domaine |

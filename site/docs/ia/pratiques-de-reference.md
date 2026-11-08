---
title: "Pratiques de référence : état réel"
sidebar_position: 8
---

:::note Page reprise de l'ancien document IA
Texte repris tel quel de `docs/ia.md` (mis à jour le 2026-11-06). Les mentions de Spring, de Java et des tâches T* décrivent l'état avant la bascule vers FastAPI : la source de vérité du suivi est Jira (projet `KAN`) et celle du comportement est le code. À actualiser épopée par épopée.
:::

## 10. Pratiques de référence : état réel

Revue du 2026-10-26 de l'existant face aux cadres retenus au § 2. « En place » signifie prouvé par un
test ou une mesure ; la règle de chaque ligne est dans les conventions.

| Pratique | État réel | Traitée par |
|---|---|---|
| Le modèle ne calcule pas ; chiffres et périodes vérifiés ; abstention | En place | T6 |
| Identifiants, noms et dates vérifiés ; période, périmètre et définition affichés | Partiel : nombres et périodes vérifiés ; `paie_mouvements` rend ses définitions, l'écart net et les « plus payés » ; identifiants et noms pas encore vérifiés | T2.7 |
| Réponse directe aux messages simples | Provisoire : tri par mots-clés dans un nœud du graphe (2 à 17 ms), à remplacer par la décision du modèle (règle « frameworks d'abord ») | T10 |
| Raisonnement et plan visibles, texte en flux | Absent : étapes du graphe affichées, texte d'un bloc après vérification | T10 à T12 |
| Code IA maison | Présent : graphe, tri, ciblage, client de modèle, client MCP, frontière AG-UI, rejoueur d'évaluation, interface Angular, scripts LiteLLM, outils MCP et jeton agent côté Java | T10 à T20 (service IA : graphe, tri, ciblage et clients maison déjà retirés) |
| Permissions revérifiées à chaque appel d'outil ; jeton délégué court ; audit par outil | En place | T4, T5 |
| Périmètre de données par fiche de poste | Absent : l'accès est réservé à `SYSTEM_ADMIN` | T2.1 à T2.3 |
| Injection directe et indirecte (champs de données piégés), exfiltration | Non testées ; seuls les refus de droits le sont | T2.6 |
| Texte du modèle rendu comme texte, aucun lien ni image actif | En place (interpolation Angular), sans test dédié | T2.6 |
| Plafonds par run | Middlewares officiels : 8 appels de modèle et 8 appels d'outils par run ; aucun plafond applicatif de génération de tokens. Délai de modèle configurable (`IA_LLM_TIMEOUT_SECONDS`, 120 s par défaut). Durée et tokens totaux du run non plafonnés côté service. | T2.5 |
| Quotas par utilisateur et budgets par poste | Absent : limite de 20 questions par minute au proxy, 60 requêtes par minute pour la clé Staport Intelligence | T2.5 |
| Contenu des messages non conservé par la passerelle | Non réglé explicitement ; journaux de dépense gardés 30 jours | T2.8 |
| Contrat de vue unique entre Spring, service IA et Angular | Absent : deux listes écrites à la main | T2.9 |
| Conversations multi-tours, isolation, suppression | Absent : chaque question est traitée seule, l'historique ne vit que dans le navigateur | T3.2 |
| Contexte d'écran | Absent | T3.3 |
| Traces OpenTelemetry, outil d'observation, alertes | Absent : journaux JSON et corrélation seulement | T3.4 |
| Objectifs de service, tests de charge et de panne | Absent ; mesure connue : p50 9,7 s et p95 26,1 s sur offres gratuites | T3.5 |
| Registre, fiche du système, analyse d'impact, notice, conservation | Absent ; accord CNDP obtenu (§ 2), sa référence et son périmètre restent à consigner | T3.6 |
| Procédure d'incident, changement de modèle, prompts versionnés | Partiel : interrupteur global en place ; prompts dans le dépôt sans identifiant de version | T3.7 |
| Évaluation hors ligne en CI, retours utilisateurs, relecture d'échantillons | Partiel : jeu de 24 cas rejoué à la demande sur vrais modèles | T3.8 |
| Langues arabe et darija | Absent | T3.9 |
| Modèle local, licence et provenance des poids | Absent : offres gratuites externes, données synthétiques | T3.1 |
| Confirmation humaine, idempotence, reprise durable | Sans objet tant que tout est en lecture | J6 |
| SBOM et analyse de vulnérabilités du service IA | Absent pour le service IA (dépendances verrouillées par `uv.lock`) ; en place pour le backend et le frontend | T3.7 |

### Pratiques émergentes adoptées le 2026-11-03

Décision du propriétaire : appliquer les pratiques actuelles de Deep Agents, LangChain et LangGraph, **sans ticket dédié** (elles s'intègrent au travail en cours et à chaque
domaine). Les règles sont dans `conventions/agents-ia.md` (`conventions/agents-ia.md`) (« Catalogue d'outils à grande échelle » et « Pratiques de référence du harnais »).
Cette table dit où le dépôt en est ; elle ne remplace pas la lecture des pages officielles.

| Pratique | État réel du service IA |
|---|---|
| Sélection d'outils juste-à-temps bornée (5 à 7) | Absent : `LLMToolSelectorMiddleware` actif jusqu'ici ; remplacé par T32. Mécanisme **vérifié sur `create_deep_agent`** (deepagents 0.7.32) : outils de compétence protégés (appel d'un outil non exposé ou refusé par le résolveur : échec, rien ne s'exécute), `pinned_skills` sans tour de modèle supplémentaire, outils du harnais conservés. Composant de recherche décidé (Q25) |
| Définition des outils selon les sources officielles (Q24) | Audit fait le 2026-11-03 : les 31 outils ont `title`, schéma de sortie et annotations ; descriptions à compléter (limites d'usage), `input_examples` et `response_format` absents ; jeu d'évaluation du choix d'outil à bâtir |
| Délestage et résumé automatiques du harnais, outil `compact_conversation` | Résumé en place (40 000 jetons, § ci-dessus) ; délestage et compaction à la demande à vérifier sur la version verrouillée |
| `StoreBackend` avec espace de noms par identité, `CompositeBackend` pour `/memories/` | Adopté pour l'espace de fichiers (`backend_par_identite`, 2026-11-03, magasin en mémoire) ; PostgreSQL et mémoire `/memories/` : T25, J4 |
| Permissions de fichiers avec règle finale « tout refuser » | Absent |
| Mode de durabilité du checkpointer explicite | Checkpointer PostgreSQL en place ; mode non fixé |
| Profils de harnais par modèle | Absent |
| Compétences d'agent en divulgation progressive | Prévu (E15.4, décision Q13) |
| Sous-agents asynchrones (lancer, vérifier, mettre à jour, annuler, lister, notifications) | À mettre en place : bêta, serveur Agent Protocol requis ; version verrouillée et test de contrat |
| Backends `FilesystemBackend` et `LocalShellBackend` | Sans objet **par la documentation** (interdits en déploiement) ; remplacés par un backend bac à sable |
| Tout autre middleware, outil intégré, backend ou primitive de graphe | Suit le registre du § 7 ; relu et mis à jour à chaque relecture d'épopée |
| Domaines en sous-agents, sous-graphes seulement si nécessaire | Domaine = compétence (T32) ; sous-agent quand le contexte du superviseur gonfle |

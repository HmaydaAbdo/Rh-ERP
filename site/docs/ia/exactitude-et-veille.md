---
title: "Exactitude et veille des modèles"
sidebar_position: 3
---

:::note Page reprise de l'ancien document IA
Texte repris tel quel de `docs/ia.md` (mis à jour le 2026-11-06). Les mentions de Spring, de Java et des tâches T* décrivent l'état avant la bascule vers FastAPI : la source de vérité du suivi est Jira (projet `KAN`) et celle du comportement est le code. À actualiser épopée par épopée.
:::

## 4. Exactitude

1. Le modèle ne calcule pas : effectifs, montants, taux et périodes viennent des outils Spring. **Priorité du
   propriétaire (2026-10-27) : faire disparaître le besoin de calcul** : tout total, écart, variation, pourcentage,
   moyenne, rang ou effectif qu'une question peut demander est renvoyé tel quel par un outil déterministe (V1d), de sorte
   que le modèle n'ait jamais qu'à reprendre des valeurs.
2. **Décision du propriétaire (2026-10-27) : le vérificateur de chiffres est supprimé** (T22, V1f). Une liste
   exhaustive de faux positifs est impossible à établir ; l'exactitude repose sur les outils métier qui renvoient leurs
   résultats calculés, sur les middlewares officiels de LangChain et LangGraph (voir « Middlewares officiels ») et sur
   le jeu de référence. Le vérificateur a été retiré après la clôture de V1d (V1f).
   Conversation : l'agent s'appuie sur les tours précédents (valeurs déjà lues, choix de l'utilisateur), les analyse,
   **pose une question** quand c'est ambigu et **relit l'ERP pour confirmer** quand une valeur peut avoir changé.
3. Sans outil ni source adaptés, l'agent s'abstient et propose l'écran classique.
4. Un jeu de référence versionné (`ia/evaluation/jeu_reference.json`, 60 cas en version 2, à porter vers
   ≈ 100 ; réponses calculées en appelant l'outil de référence sur la base synthétique ; critères et types de cas :
   conventions (`conventions/agents-ia.md`) ;
   chaque cas rejoué plusieurs fois, `-Dia.evaluation.repetitions=3`) est rejoué à chaque
   changement de modèle, prompt, outil ou graphe par `EvaluationAgentIaTest`. Il décide des
   modèles de chaque tag LiteLLM : exactitude, latence p95, coût.
5. Sorties structurées validées par Pydantic côté service et par schéma côté Angular ;
   `enable_json_schema_validation` côté LiteLLM.
   Aucun plafond applicatif de génération (`max_tokens`) sur le modèle principal, le sélecteur ou le résumeur :
   les limites natives du modèle s'appliquent, sans coupure fixe à 300 ou 1 500 tokens.
6. Annulé (T2.7, 2026-10-27) : l'extension du vérificateur aux identifiants, noms et dates n'a plus lieu d'être.
   Chaque chiffre principal affiche sa période, son périmètre et la définition de l'indicateur (champs fournis par l'outil).

### 4.1 Veille mensuelle et évolution des modèles

Cette routine est commune à Claude et Codex : `CLAUDE.md` renvoie à `AGENTS.md`, qui renvoie à ce document. Elle
est exécutée au moins une fois par mois, et à la demande du propriétaire lorsqu'une nouvelle version est signalée.
La date de la dernière revue, ses sources et ses conclusions sont consignées en commentaire de la tâche Jira du mois
(label `veille-ia`, que la règle d'automatisation ne sait pas poser : le premier geste de la revue est de l'ajouter à la
tâche du mois), jamais dans ce document : l'état des candidats et le journal des revues vivent dans Jira. La veille ne se
limite pas aux noms de modèles déjà inscrits ici, à une seule famille d'IA, ni aux fournisseurs actuellement configurés.

**Passage global du 2026-11-09.** Toutes les couches Python (verrous `api` et `ia`, image `python:3.14-slim` à jour) et les paquets IA npm (`@ag-ui/client` et `@ag-ui/core` 1.0.4, `@copilotkit/runtime` et `@copilotkit/sqlite-runner` 1.85.0) ont été montés ensemble ; Dependabot passe à un rythme mensuel pour tous les écosystèmes (Python, npm, images Docker, actions GitHub, site de documentation). Retards déclarés : Python 3.15 (pas de wheel `cp315` pour `onnxruntime`, requis par `fastembed`) et `@a2ui/angular` 0.14 avec `@a2ui/web_core` 0.15 (incompatibles avec `@a2ui/markdown-it`, qui exige `web_core` ^0.14, et avec zod 4, voir `scripts/ia/verrous.txt`). Le reste (npm du frontend hors IA, infrastructure et CI, PostgreSQL 18) est suivi dans Jira.

**Une routine, pas une option.** Chaque mois, une tâche Jira « Veille mensuelle IA » est créée automatiquement (règle
d'automatisation planifiée du projet `KAN`) et la revue est faite en entier, qu'il y ait du nouveau ou non. Elle
couvre à chaque fois **toutes** les fonctions du point 2 ci-dessous : conversation, voix (ASR et TTS) en arabe, Darija
et Arabizi, identification de langue ou de dialecte, OCR et traduction, ainsi que le relevé de versions
(`scripts/ia/veille-versions.mjs`). « Rien de nouveau » est un résultat valable : un commentaire sur la tâche du mois, avec la liste des
fonctions réellement cherchées et ce qui n'a pas pu être lu, puis on passe. Toute fonction non cherchée est écrite comme
telle dans ce commentaire et ouvre une tâche `veille-ia` pour la couvrir, jamais omise en silence.

**Une nouvelle version trouvée.** Tout reste gratuit : modèles et services via LiteLLM ou auto-hébergés ; un service
payant est écarté et noté dans la tâche.

* Version compatible : on l'adopte (une branche, une PR à CI verte, `scripts/ia/verrous.txt` mis à jour).
  Pour un modèle ou une configuration LiteLLM, la proposition attend la confirmation du propriétaire (point 6).
* Version incompatible ou problème trouvé : on ne contourne pas en silence. On ouvre un ticket Jira (message d'erreur
  exact, reproduction minimale), on ouvre un signalement chez l'éditeur et on déclare le retard dans `blocages` de
  `scripts/ia/veille-versions.mjs` avec la clé du ticket ; on le retire dès que la cause disparaît.

À chaque revue, l'assistant :

1. Cherche les versions récentes et annonces crédibles à partir des fiches de modèles, dépôts, notes de version,
   publications, évaluations et licences des auteurs ou éditeurs. Il distingue les poids réellement publiés, les
   annonces sans artefacts accessibles, les services API et les modèles seulement expérimentaux.
2. Sépare les fonctions qui ne sont pas interchangeables : génération et agents conversationnels, reconnaissance
   vocale/transcription (ASR), identification de langue ou de dialecte, synthèse vocale (TTS), OCR et traduction.
   Une adaptation de Voxtral pour la darija est une piste ASR : elle transcrit la parole et ne remplace pas le modèle
   conversationnel qui répond dans l'ERP.
3. Vérifie pour chaque piste l'identifiant et la version exacte, la date, les capacités réellement documentées, les
   scripts et langues couverts, les variantes régionales, les données et leur provenance, la licence, les conditions
   d'usage commercial, les dépendances et risques de code de chargement, les exigences matérielles et les limites
   publiées. Les scores d'un éditeur sont signalés comme tels ; des scores agrégés « arabe dialectal » ne sont pas
   présentés comme des résultats Darija marocains.
4. Élargit ou réduit la liste sans présumer que la décision actuelle est définitive. Il conserve les candidats
   précédents et les raisons de les garder ou de les écarter, pour rendre les comparaisons mensuelles traçables.
5. Quand un candidat est accessible et pertinent, le compare sur le même jeu de référence et avec les mêmes
   consignes, paramètres et budgets que la version courante. Il analyse séparément la compréhension et la réponse en
   darija écrite en alphabet arabe et en Arabizi, le mélange avec le français, les variantes régionales utilisées par
   Staport, les cas métier, les appels d'outils, les erreurs critiques et la latence. L'évaluation vérifie aussi si
   LIDstral améliore réellement les entrées en alphabet arabe par rapport au traitement direct et mesure explicitement
   sa limite sur Arabizi. Il ne conclut pas à un gain en
   comparant des scores issus de protocoles différents.
6. Présente une recommandation exploitable : modèle et révision exacte, tâches concernées, gains et régressions
   mesurés, licence/provenance, ressources et latence, risques connus, fournisseur ou mode de service, configuration
   LiteLLM proposée et retour arrière. **La revue peut préparer cette proposition, mais l'adoption ou la modification
   de la configuration attend la confirmation humaine du propriétaire.** Après confirmation, rejouer le jeu de
   référence conformément au § 4 et à T3.7 avant de déclarer le changement réussi.

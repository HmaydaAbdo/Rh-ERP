# Plan de travail IA — document unique des tâches restantes

> **Document de référence du travail IA (validé en principe par le propriétaire le 2026-10-31).** Ce fichier regroupe, en
> un seul endroit, tout ce qui reste à faire pour l'IA d'ERP-RH : l'historique complet des anciens plans (y compris les
> documents supprimés le 2026-10-24), le plan actuel de `docs/ia.md`, l'inventaire des fonctions de CopilotKit, LangChain,
> LangGraph et Deep Agents, et l'analyse des écarts du backend. Chaque tâche a été **comparée au code du dépôt** : ce qui
> est déjà fait n'y figure pas (voir § 2). Les points que le code ne permettait pas de trancher ont été posés au propriétaire
> un par un : ses décisions sont au § 6.
>
> Ce que ce document ne remplace pas : `docs/ia.md` garde les décisions, l'architecture, l'état technique et le journal.
> Il remplace en revanche son § 7 (tableaux de tâches), qui devient un renvoi ici, et les deux fichiers de Codex
> `copilot-kit-future-to-implement.md` et `backend-gap-analysis.md`, **supprimés le 2026-10-31** après vérification que
> chacune de leurs informations figure ici (relisibles avec `git show 0b2fd0da:docs/ia/<fichier>`).

## 0. Suivi d'avancement (le seul endroit où l'on marque l'état)

**Règle de travail** : l'assistant avance épopée par épopée dans l'ordre du § 4, ne marque une tâche « Terminé » que si sa
« preuve de terminé » est fournie, ne supprime ni fichier, ni branche, ni donnée hors du périmètre de la tâche en cours, et
met à jour ce tableau dans le même commit que le travail.

**Vocabulaire** (une tâche et une épopée n'ont qu'un état) :

| État | Sens |
|---|---|
| **Terminé** | Toutes les preuves de terminé sont fournies et le code est dans `main` ou prêt sur `dev/suivi`. |
| **Partiel** | Une partie est livrée et utilisable ; le reste est listé. |
| **Incomplet** | Commencé mais non utilisable en l'état, ou bloqué par une décision ; la cause est notée. |
| **Non touché** | Rien n'est commencé. |

Toute tâche est **Non touché** tant qu'elle ne figure pas dans la colonne « Exceptions ».

| Épopée | État | Exceptions (tâches non « Non touché ») |
|---|---|---|
| E0 Refonte totale du frontend | **Terminé** (2026-11-01) | E0.9 **Terminé** (`DESIGN.md` généré depuis l'application construite ; `impeccable detect` sans signalement dans le code et sur le catalogue ; `conventions/design-system.md` à jour ; **relecture indépendante** par `/code-review` niveau élevé sur les commits d'accueil, de navigation et de clôture : 8 constats, 4 corrigés (variations de l'accueil en unité et en %, course au premier enregistrement → conflit 409, accueil vidé par retrait de droits → retour à tous les indicateurs autorisés, code mort), 4 consignés sans correction (commande Accueil du dock inatteignable tant que E6 n'a pas défini les fiches de poste, contrôle d'espacement limité aux attributs `class`, préfixe de route du dock, doublon des méthodes de l'accueil) ; **Kill AI Slop** sur `frontend/src` : 3 défauts confirmés corrigés (catalogue à hiérarchie plate, ombre surdimensionnée du tableau plein écran, coche SVG dessinée à la main), 0 signalement restant) ; E0.8 **Terminé** (l'arabe n'est pas livré par décision : seulement préparé et contrôlé) ; E0.7 **Terminé** (13 écrans × 2 thèmes × ordinateur et téléphone sous garde automatisée, 130 tests e2e) ; E0.6 **Terminé** (hooks Impeccable actifs ; `impeccable live` disponible à la demande, non requis par le critère de sortie ; Hallmark écarté : scripts de 7 261 lignes, génération d'images par appel réseau) ; E0.5 et E0.5b **Terminés** (paie, chantiers et accueil réalisés et corrigés avec le propriétaire ; vocabulaire « bulletins de paie » appliqué à l'interface, au rapport PDF, à l'export Excel et à la documentation) ; E0.4 à E0.1 **Terminés** ; E0.R lue ; navigation unifiée dans la barre Staport. Reporté hors de E0, à sa place dans E6 : **accueil par défaut par fiche de poste (E6.8)**, qui dépend de la fiche de poste. Vérifié le 2026-11-01 : lint, 4 contrôles (`check:composants`, `check:espacement`, `check:logique`, `check:contraste`), 966 tests unitaires, 130 tests e2e, tests backend du rapport, de l'export, de l'accueil, de la sécurité des endpoints, de l'architecture et des outils MCP ; la CI n'a pas été lancée. Détail antérieur : E0.5 **Préparé, en attente de validation** (2026-11-01 : captures de la paie sur ordinateur et des chantiers sur téléphone, en clair et en sombre, dans `docs/frontend/references/`, régénérables par `npm run e2e:references` ; l'application n'a pas d'écran d'accueil propre, question posée au propriétaire) ; E0.8 **Terminé** (2026-11-01 : propriétés logiques partout, `npm run check:logique` sans infraction et branché dans la CI, glissements inversés sous `dir="rtl"`, essais `e2e/rtl.spec.ts` ; l'arabe n'est pas livré) ; E0.7 **Garde automatisée en place** (2026-11-01 : `e2e/domaines-rendu.spec.ts`, 12 écrans × 2 thèmes × ordinateur et téléphone : aucun débordement, aucune violation axe, aucune erreur de console ; la validation visuelle de chaque domaine reste au propriétaire) ; E0.5b **Réalisé, en attente de validation** (2026-11-01 : domaine `accueil` backend + frontend, voir `docs/accueil/README.md` ; reste à rattacher l'accueil par défaut à la fiche de poste quand E6 la créera, voir la note sous la ligne E0.5b) ; E0.6 **Partiel** (2026-11-01 : hooks Impeccable activés avec l'accord du propriétaire (`.claude/settings.local.json`, local) ; Hallmark écarté (scripts de 7 261 lignes, génération d'images par appel réseau à Together AI, règles pour sites vitrines contraires à une application de travail) ; `impeccable live` disponible à la demande en E0.7 ; faux positif du catalogue corrigé (bandeau d'état sans cadre) ; `impeccable detect` passe de 43 à 0 signalement dans le code source ) ; E0.4 **Terminé** (2026-11-01 : `stp-table` bâti sur AG Grid Community 36.2.0 et `stp-chart` sur `ng2-charts` 11.0.0, thème par les jetons ; plus aucun tableau HTML natif, y compris les petites listes d'import et les données d'accompagnement des graphiques ; indicateurs groupés dans un seul graphique avec un axe par unité ; palette des séries à 3:1 minimum dans les deux thèmes ; 953 tests unitaires et 73 tests e2e passent) ; E0.3 **Terminé** (2026-11-01 : `/catalogue` montre les composants partagés et le vocabulaire des feuilles `styles/` en clair et sombre, ordinateur et téléphone ; aucune violation axe ; captures de référence dans `docs/frontend/references/` régénérables par `npm run e2e:references`) ; E0.2 **Terminé** (2026-11-01 : plus aucun composant de domaine ne porte de styles propres, contrôle `npm run check:composants` sans liste de référence et branché dans la CI ; exports navigateur supprimés ; détail dans `docs/frontend/inventaire-composants.md`) ; E0.1 **Terminé** (2026-10-31 : jetons des deux thèmes dans `_tokens.scss`, thème sombre gris chaud neutre à action blanc cassé sur décision du propriétaire, Inter embarquée, IBM Plex retirée, ancienne identité supprimée ; `npm run check:contraste` : 0 échec requis, rapport `docs/frontend/contraste-jetons.md` ; catalogue, connexion et téléphone vérifiés en clair et sombre ; les écrans métier sont revérifiés domaine par domaine en E0.7 ; palette des graphiques reprise en E0.4) ; E0.R **Partiel** (2026-10-31 : pages utiles à E0.1 lues en entier, journal au § 4 ; reste listé « non vérifié ») ; charte retenue (« standard de la catégorie », 2026-10-31) ; skills de design installés ; PRODUCT.md écrit |
| E1 Socle de vérité | Partiel | E1.7 **Partiel** (2026-11-01, voir la ligne E1.7) ; branche dédiée `claude/e1-socle-de-verite` depuis `main` (E0 fusionnée par la PR #112) ; E1.2 (couches 1, 3 et 4 faites le 2026-10-31 ; reste l'abonnement aux publications, à faire par le propriétaire) ; E1.9 **Terminé** ; E1.10 **Non touché** (prochaine tâche ; protocole v0.9 adopté, v1.0 quand il sera stable) ; zod reste en 4 (voir § 3) ; E1.8 texte prêt, envoi par le propriétaire ; E1.1 **Partiel** (2026-10-31 : verrous Python et npm alignés, `@ag-ui/a2ui-middleware` 0.0.14 ; `@a2ui/web_core` 0.14.0 **testé et refusé** : le rendu de `@copilotkit/angular` 0.6.0 est écrit pour 0.10.4 et 3 tests du catalogue ERP échouent ; `openai` bloqué par `litellm`, E14) |
| E2 Fiabilité de l'agent | Non touché | — |
| E3 Migration Spring → Python FastAPI | Non touché | Décision prise (Q15) : tout le backend, domaine par domaine ; ADR (E3.1) à écrire |
| E4 Rôles, départements, hiérarchie, champs | Non touché | — |
| E5 Confidentialité, traces, conformité | Non touché | — |
| E6 Sécurité par fiche de poste | Non touché | — |
| E7 Résorption du code maison | Non touché | — |
| E8 Conversations et mémoire | Non touché | — |
| E9 Interface CopilotKit complète | Non touché | — |
| E10 Écritures et approbation humaine | Non touché | Inactive : lecture seule jusqu'après le pilote réel (Q4) |
| E11 RAG et assistant réglementaire | Non touché | — |
| E12 Agents spécialisés, Deep Agents | Non touché | — |
| E13 Pilote réel, exploitation | Non touché | — |
| E14 IA interne : vLLM et sortie de LiteLLM (dernière) | Non touché | Matériel inconnu : commence par l'inventaire (Q18) |

## 1. Principes

Décisions du propriétaire, dont celle du **2026-10-31** (en gras) :

0. **Aucune supposition sur un framework** (décision du 2026-10-31) : une affirmation sur le comportement, la version
   ou la gratuité d'un framework ou d'une bibliothèque n'est écrite qu'après lecture **de la page officielle ou du code
   source**, en entier ; une lecture tronquée est poursuivie (par exemple avec `curl` sur le fichier brut) ; ce qui n'a pas
   pu être lu est noté « non vérifié ». Les connaissances de mémoire ne sont pas une source.
1. **Utiliser toutes les fonctions que fournissent les frameworks** (CopilotKit, LangChain, LangGraph, Deep Agents) pour
   profiter de leur expérience éprouvée. Ce principe **remplace** la règle « ne pas adopter toutes les fonctions disponibles,
   chaque adoption doit répondre à un parcours réel » des anciens documents de Codex. Une fonction n'est écartée que par une décision écrite du propriétaire ou parce qu'elle
   enfreint un garde-fou ci-dessous ; celles qui exigent un service payant ou hébergé sont **regroupées dans la dernière
   section « Fonctions exclues définitivement »**.
2. **Dernières versions stables seulement**, alignées à chaque revue ; les préversions sont suivies à part. **Une version
   publiée n'est pas réputée compatible sans vérification** (tests, migration documentée).
3. **Documentation officielle seule** comme source de vérité ; pas de recopie du comportement d'un framework en code ERP-RH
   (« zéro code IA fait maison », décision du 2026-10-27).
4. **Dépasser les limites actuelles par la mesure** : les plafonds du code (§ 3) sont des réglages, pas des principes ;
   chacun est rendu configurable, mesuré, puis relevé ou justifié.
5. Garde-fous qui ne bougent pas, pour **chaque** fonction adoptée :
   - **gratuit** : aucun abonnement ni service payant (décision du 2026-10-27) ;
   - **Le backend métier reste l'autorité** des données, droits, filtres et calculs (Spring aujourd'hui, FastAPI domaine par domaine selon E3) ; les droits sont revérifiés à chaque appel ;
   - **données RH** : minimisation, audit, loi 09-08 ; aucune donnée réelle vers un modèle externe sans décision (Q5) ;
     **le masquage des champs sensibles est une règle métier appliquée côté Spring** (décision du 2026-10-31, E4) ;
   - **auto-hébergé** : les services hébergés par l'éditeur (CopilotKit Intelligence, LangSmith) sont exclus définitivement
     (Q3).
6. **Définition de « terminé »** pour toute tâche : test automatisé vert, droits testés (cas négatifs), preuve au navigateur
   ou dans une trace Phoenix pour ce qui se voit, documentation à jour.
7. **Une seule branche de suivi** (`dev/suivi`), un commit thématique par tâche, une PR à la fois et seulement sur demande.

### Fonctions exclues définitivement (décision du propriétaire, 2026-10-31, Q3)

Rien de ceci n'est adopté ni planifié ; cette liste évite de le reproposer :

- **CopilotKit Intelligence** : AG-UI Streams, mémoires utilisateur (`injectMemories`), fils enrichis (`injectThreads`,
  `CopilotThreadsDrawer`, Rich Threads, `identifyUser`), apprentissage automatique, trajectoires, analyses produit, collecteur
  `@copilotkit/learning`, canaux Slack et Teams, import d'historique, `selfManagedAgents` en production, runtimes Python, Go,
  Ruby et .NET de CopilotKit. Offres relevées sur la page de prix de CopilotKit le 2026-10-31 : *Free* (usage non productif
  auto-hébergé, licence renouvelable tous les 30 jours, ou hébergé jusqu'à 1 000 interactions par mois), *Pay-as-you-go*
  49 $ par mois, *Annual* sur devis.
- **LangSmith** : Studio, observabilité et évaluations hébergées, déploiement géré (serveur d'agent, clé
  `LANGGRAPH_CLOUD_LICENSE_KEY`), Fleet, Managed Deep Agents.
- **`ProviderToolSearchMiddleware`** (réservé à Anthropic Claude 4+ et OpenAI gpt-5.5+, modèles payants).
- **Fournisseurs de bacs à sable hébergés** pour Deep Agents.
- **Tâches proactives et apprentissage automatique** des conversations.

## 2. Déjà fait (comparé au code le 2026-10-31) — donc absent du plan

- **Backend IA** : `create_agent` (LangChain 1.4.7) sur LangGraph 1.2.19 ; middlewares `TodoListMiddleware`,
  `ModelCallLimitMiddleware`, `ToolCallLimitMiddleware`, `SummarizationMiddleware` (40 000 jetons, résumé interne),
  `LLMToolSelectorMiddleware`, `CopilotKitMiddleware`, `dynamic_prompt` ; checkpointer `AsyncPostgresSaver` dans une base
  dédiée, fils isolés par utilisateur, purge après inactivité ; flux AG-UI (`ag-ui-langgraph`) ; évaluation `openevals` /
  `agentevals` ; traces OpenTelemetry vers Phoenix ; passerelle LiteLLM multi-fournisseurs gratuits avec garde-fou officiel
  `litellm_content_filter` ; vérificateur de chiffres **supprimé** (V1f).
- **Outils métier** : 30 outils MCP **en lecture seule** (Spring AI), dont `paie_comparer` (V1d, calculs côté Spring),
  Heures supplémentaires, Audit, Paramètres, Rôles ; jeton agent RS256 court ; aucune écriture.
- **Interface** : `CopilotChat`, `CopilotSidebar`, libellés (`provideCopilotChatLabels`), `injectAgentStore`,
  `connectAgentContext` (contexte d'écran), `registerHumanInTheLoop` (question de clarification), suggestions de départ,
  catalogue A2UI de l'ERP (tableau, indicateurs, graphique), runtime CopilotKit 1.83.0 avec `SqliteAgentRunner`.
- **Plan** : T1 à T8, T11 à T17, T19 (côté service), T22, V1a, V1d, V1f, J0. **Partiels, donc repris plus bas** : T9 et T20
  (démonstration J1 → E13.1), T10 (qualification → E1.3), T18 (observabilité → E5.2, E5.3), T19 (reprise du fil dans
  l'interface → E1.6, E8.1) ; J1 reste « en cours » tant que ces points ne sont pas clos.

## 3. État des versions et des plafonds (relevé du 2026-10-31)

Versions : `uv.lock` / `package-lock.json` contre PyPI et npm. Les écarts sont des tâches (E1.1).

| Composant | Verrouillé | Dernière stable | Remarque |
|---|---|---|---|
| `langchain`, `langgraph`, `langgraph-checkpoint-postgres`, `langchain-litellm`, `ag-ui-langgraph`, `ag-ui-protocol`, `copilotkit` (Py), `mcp`, `openevals`, `@copilotkit/angular`, `@copilotkit/runtime`, `@ag-ui/client` | à jour | identique | — |
| `langchain-core`, `langgraph-sdk`, `litellm`, `openinference-instrumentation-langchain`, `pydantic`, `pydantic-settings` | **alignés le 2026-10-31** (1.7.3, 0.4.11, 1.106.6, 0.1.81, 2.14.2, 2.16.2), 51 tests passés | identique | `litellm` 1.109.0.dev2 existe : préversion, non adoptée |
| `openai` | **3.42.0 (2026-11-01)** | 3.42.0 | **bloqué par `litellm` 1.106.6, qui exige `openai<3.0.0`** (et `langchain-openai` 1.7.3 `>=2.45.0`) : limite **consignée**. **Relevé du 2026-11-01 sur PyPI** : seules des préversions de `litellm` lèvent la borne (`1.108.0rc1`, `1.109.0.dev1`, `1.109.0.dev2` : `openai<4.0.0,>=2.20.0`), aucune version stable ; la PR Dependabot #121 (openai 3.41.0 + litellm 1.109.0.dev2) passe `backend` et `ia` ; **décision du propriétaire du 2026-11-01 : `litellm` 1.109.0.dev2 adoptée**, `openai` 3.42.0. Reprise de la ligne d'origine ; la 3.x sera adoptée dans **E14**, quand LiteLLM sera abandonné (ou s'il lève sa borne avant) |
| `agentevals` | 0.0.9 | 0.0.9 | **dernière publication le 2025-07-24** : bibliothèque dormante, conservée (décision du 2026-10-31), à surveiller |
| `@copilotkit/core`, `@copilotkit/shared`, `web-inspector`, `web-components`, `mcp-apps-renderer` (frontend) | **1.83.0 le 2026-10-31** | 1.83.0 | **Cause de l'écart** : ce sont des dépendances **transitives** de `@copilotkit/angular` 0.6.0 (`^1.79.1`) ; le verrou n'avait jamais été relevé. Corrigé par `npm update`, build, lint et 965 tests passés |
| `@a2ui/web_core` | 0.10.4 | 0.14.0 | **bloqué par le rendu** : `@copilotkit/angular` 0.6.0 (dernière stable) épingle 0.10.4 ; avec 0.14.0 forcé, 3 tests du catalogue ERP échouent. **Cause établie** : depuis web_core 0.12.0, le constructeur `Catalog` exige `protocolVersion` en deuxième paramètre ; `CopilotA2UICatalog extends Catalog` et `createAngularCatalog` de `@copilotkit/angular` appellent encore `(id, composants, fonctions)`, donc les arguments sont décalés et le catalogue ERP n'a plus de composants. Le `package.json` de la branche `main` de CopilotKit épingle toujours 0.10.4 (relevé le 2026-10-31). Voies : attendre la version suivante, ouvrir un ticket (ou une PR) chez CopilotKit, ou changer de moteur de rendu (`@a2ui/angular` 0.13.0, qui dépend de web_core `^0.14.0`) — voir Q20. Le catalogue de base du service IA reste celui de 0.10.4. À relever avec la prochaine version de `@copilotkit/angular` qui épingle une version plus récente |
| `zod` (surcharge 4.6.7) | 4.6.7 | 4.6.7 | **Ne pas repasser en zod 3** : la surcharge corrige l'avis GHSA-mrhx-c7xc-m3w5 (sévérité haute, épuisement mémoire, versions `< 4.6.6` sans correctif en 3.x). Les paquets A2UI et CopilotKit déclarent `^3.25.x` mais fonctionnent en 4 ; seul le formatage d'une erreur de validation d'A2UI plante (E1.9) |
| `@ag-ui/a2ui-middleware` (surcharge) | **0.0.14 le 2026-10-31** | 0.0.14 | build, lint et 965 tests passés |
| `deepagents` | absent | 0.7.32 | non adopté |
| CopilotKit `next` | — | 2.0.0-rc.7 | préversion : suivie, non adoptée |

Plafonds actuels du code, relevés le 2026-10-31 (à mesurer puis relever, E2.9) : 8 appels de modèle et 8 appels d'outils par
run (`agent.py`) ; délai de modèle 120 s (`config.py`, réglable jusqu'à 600 s) ; résumé à 40 000 jetons en gardant 12 messages ;
`recursion_limit` 200 (`agui.py`) ; 20 lignes au plus par page d'outil MCP (backend). **Il n'existe plus de plafond de
génération de jetons** (l'ancien `max_tokens=1500` a été retiré) **ni de plafond de 12 000 caractères par résultat d'outil**
(cité à tort dans `docs/ia.md` ancien et dans un commentaire de `agent.py`, corrigé le 2026-10-31).

## 4. Épopées, dans l'ordre de travail

**L'ordre numérique est l'ordre de travail.** Le 2026-10-31, le propriétaire a ajouté **E0 (refonte totale du frontend)** en
tête : toutes les autres épopées ont été décalées d'un rang (l'ancienne « socle » devient E1, « agent » E2, « migration
FastAPI » E3, « rôles et champs » E4, … jusqu'à « IA interne », qui devient E14). On commence par offrir une interface
confortable et cohérente (E0), puis on assoit ce qui rend tout le reste mesurable (E1, E2), on tranche l'architecture du
backend (E3), on pose les rôles et la sécurité par champ (E4) avant la confidentialité et la sécurité par fiche de poste
(E5, E6), puis on résorbe le code maison (E7), on traite les conversations (E8) et l'interface de l'assistant (E9), et
seulement ensuite les écritures, le RAG, les agents spécialisés et le pilote réel (E10 à E13). **E14 (IA interne, vLLM) est la
dernière épopée.** Les services payants sont exclus définitivement (§ 1).

Dépendances qui justifient l'ordre :

- **E0 en premier** : la refonte fixe les jetons, les composants partagés, AG Grid et `ng2-charts` ; E1.10 (surfaces A2UI) et E9 (interface de l'assistant) réutilisent ces composants et ne les refont pas.
- **E3 avant E4** : la migration est décidée (tout le backend, domaine par domaine). E4 (rôles, départements, champs) et E6
  (sécurité par fiche de poste) se construisent sur le domaine `auth` **déjà migré** (E3.5) ; E11 (RAG) et les outils d'E12
  s'appuient sur les domaines migrés qu'ils interrogent. L'ADR (E3.1) précède tout ; les domaines métier (E3.6) peuvent se
  poursuivre pendant E4 à E9 tant que chaque domaine est servi par un seul backend à la fois.
- **E4 avant E5 et E6** : le masquage est une règle métier appliquée par les projections par champ.
- **E5 et E6 avant tout utilisateur réel** : l'interface ouverte (E9.9) exige E5.5 (interrupteur d'arrêt) et E6.5 (jeu adverse).
- **E7 après E6** ; **E8 après E7.2 et E7.8** ; **E11 après E6** (droits filtrés avant le modèle) ; **E12 après E2.0 et E6**.
- **E13 (pilote réel) exige E5, E6 et E4.** E10 (écritures) reste bloquée par Q4.

### 4.0 Relecture d'entrée de chaque épopée (décision du 2026-10-31)

Avant la première tâche d'une épopée, lire **en entier** les pages officielles ci-dessous et le journal de modifications des
paquets concernés, pour rattraper les nouveautés ; consigner dans le commit les versions, les nouveautés retenues et les
pages lues. Une épopée ne passe pas à « Partiel » sans cette relecture.

| Épopée | Documentation à relire (index officiel de chacun) |
|---|---|
| E0 | angular.dev (signaux, formulaires, accessibilité, CDK, Aria) ; AG Grid Community ; `ng2-charts` et Chart.js ; WCAG 2.2 ; références d'Impeccable |
| E1, E2 | LangChain : agents, middlewares (vue d'ensemble et préconstruits), sortie structurée, runtime, tests ; LangGraph : persistance, durabilité, streaming ; Deep Agents : vue d'ensemble, personnalisation ; journaux de `langchain`, `langgraph`, `deepagents` |
| E3 | FastAPI, Pydantic, SQLAlchemy, SDK MCP Python |
| E4, E6 | Spring Security et Spring AI (serveur MCP) ; LangChain : runtime et contexte |
| E5 | LangChain : garde-fous, middleware PII, politique de traces ; LangGraph : persistance (chiffrement) ; Phoenix / OpenInference |
| E7 | CopilotKit : runtime, authentification, déploiement, `injectThreads` ; LangGraph : stores ; `ag-ui-langgraph` ; Spring Authorization Server |
| E8 | LangGraph : persistance, mémoire, stores ; LangChain : mémoire à long terme, join/rejoin ; Deep Agents : mémoire ; CopilotKit : fils |
| E9 | Toute la documentation CopilotKit Angular (guides, référence, exemples, production, dépannage) ; spécification AG-UI et A2UI |
| E10 | LangChain : human-in-the-loop ; LangGraph : interruptions ; CopilotKit : interactions humaines |
| E11 | pgvector, PostgreSQL (recherche plein texte), documentation du modèle d'embeddings choisi ; LangChain : retrieval |
| E12 | Deep Agents : toutes les pages ; LangChain : multi-agents ; LangGraph : sous-graphes |
| E13 | Documentation des fournisseurs de modèles de la passerelle ; ce qui a changé depuis la dernière relecture |
| E14 | vLLM (installation, serveur compatible OpenAI, quantification, parallélisme), LangChain (`langchain-openai`) |

Chaque ligne est une tâche « E*n*.R » de son épopée.

### E0 — Refonte totale du frontend (décision du propriétaire, 2026-10-31)

**Objectif** : une interface que l'utilisateur aime et où il se sent à l'aise, texte toujours clairement visible, bordures
franches (surtout les tableaux), tous les écrans composés de **composants partagés** (aucun composant propre à un domaine).
**Charte retenue : « standard de la catégorie » exécuté sans faute**, thèmes clair et sombre, niveau visé Linear, Stripe
Dashboard et Notion ; elle est décrite dans `conventions/design-system.md` (palette, bordures, typographie Inter) et
`PRODUCT.md`. Le nom et le logo Staport sont conservés ; tout le reste est redessiné. Mode : Operate (écrans de travail), à
construire en code, jugé dans le navigateur. Aucune étape de maquette séparée : la **galerie de composants** de l'application
sert de référence visuelle.

| ID | Tâche | Preuve de terminé | Origine |
|---|---|---|---|
| E0.R | Relecture d'entrée (§ 4.0) : angular.dev (signaux, formulaires, accessibilité, CDK, Aria), AG Grid Community, `ng2-charts` et Chart.js, WCAG 2.2, références d'Impeccable | Pages lues consignées | Décision 2026-10-31 |
| E0.1 | **Charte → jetons** : implémenter dans `frontend/src/styles/_tokens.scss` les deux thèmes de `conventions/design-system.md` (palette, bordures franches ≥ 3:1, Inter embarquée, chiffres tabulaires, échelle d'espacement aérée) ; supprimer les jetons de l'ancienne identité (échelle de marque, cuivre, Graphite) ; mesurer tous les contrastes | Rapport de contraste automatisé, aucun ancien jeton restant | Charte du 2026-10-31 |
| E0.2 | **Composants partagés** : inventorier tout composant propre à un domaine (dossiers `features/*`, `core/assistant/catalogue`) qui porte du visuel, le remplacer par un composant de `shared/ui/` (ajouté ou étendu au besoin) ; règle écrite et vérifiée en CI (aucun composant visuel hors `shared/ui/`) | Inventaire à zéro, contrôle en CI | Décision 2026-10-31 |
| E0.3 | **Galerie de composants** : une page de l'application montrant chaque composant partagé dans tous ses états (repos, survol, focus, désactivé, vide, chargement, erreur) en thème clair et sombre, sur ordinateur et téléphone ; source des captures de référence | Galerie livrée, captures Playwright de référence | Décision 2026-10-31 |
| E0.4 | **Tableaux et graphiques officiels** (ancienne E7.11, Q21) : AG Grid Community pour tous les tableaux, `ng2-charts` pour tous les graphiques, habillés par les jetons ; **indicateurs groupés en barres côte à côte dans un seul graphique, un second axe par unité différente (décision du 2026-11-01)** ; bordures franches, lignes hautes, tri, recherche, plein écran conservés ; **plus aucun export fait dans le navigateur (PDF d'impression, CSV) : seuls les exports du backend subsistent, dont le rapport de paie (décision du 2026-11-01)** | Écrans existants sans régression (tests unitaires et e2e), composants maison supprimés | Q21 |
| Q22 | **Refonte totale du frontend en première épopée (E0)** : charte « standard de la catégorie » exécuté sans faute, clair et sombre, bordures franches (tableaux surtout), niveau visé Linear, Stripe Dashboard et Notion ; seuls le nom et le logo Staport sont conservés ; composants uniquement partagés ; skills de design installés (Hallmark, Kill AI Slop, après Impeccable et taste-skill) ; pas de Figma : galerie de composants dans l'application. |
| E0.5 | **Trois écrans de référence** réalisés en vrai et validés par le propriétaire avant tout déploiement : la paie sur ordinateur, l'accueil, un écran de chantier sur téléphone | Validation du propriétaire sur le rendu réel | Décision 2026-10-31 |
| E0.5b | **Accueil propre et dynamique** (décisions du propriétaire, 2026-11-01) : un écran d'accueil qui diffère d'un utilisateur à l'autre ; l'administrateur choisit les indicateurs affichés (tableau de bord d'accueil) ; **configuration par fiche de poste, avec exception par utilisateur** ; **l'utilisateur peut masquer, ordonner et ajouter des indicateurs, dans la limite de ceux que sa fiche de poste l'autorise à voir** ; chaque indicateur est protégé par les permissions de son domaine ; nouveau domaine à documenter (README, skill, permissions) et à exposer à l'IA par MCP (règle d'`AGENTS.md`) | Accueil réalisé en vrai (frontend + backend), validé par le propriétaire comme troisième écran de référence | Décision 2026-11-01 |
| E0.6 | **Outillage de contrôle** (accord du propriétaire requis pour les hooks) : `impeccable detect` en hook après chaque modification d'interface, `impeccable live` pour les variantes, captures Playwright clair/sombre/téléphone, contrôle d'accessibilité automatisé (axe), Kill AI Slop en fin de refonte (**état de départ du 2026-10-31** : 43 signalements sur 314 fichiers, dont 5 groupes confirmés à faire disparaître : dégradé atmosphérique du rail `app.component.scss`, verre dépoli de la carte de connexion, deux icônes SVG dessinées à la main dans les assistants d'import et d'export de paie, ombre surdimensionnée du tableau plein écran, hiérarchie typographique plate de la page « Catalogue Staport » ; objectif : zéro défaut confirmé) ; Hallmark à évaluer (scripts non audités) | Contrôles exécutables d'une commande, rapport joint à la PR | Décision 2026-10-31 |
| E0.7 | **Déploiement domaine par domaine**, du moins au plus critique : `parametre`, `audit`, `function`, `equipe`, `chantier`, `employee`, `heuresupp`, `paie`, `auth`, carte des chantiers, assistant (surfaces A2UI comprises) ; à chaque domaine : composants partagés seulement, deux thèmes, téléphone, clavier, tests | Une validation visuelle et un audit par domaine | Décision 2026-10-31 |
| E0.8 | **Préparer l'arabe de droite à gauche** : propriétés logiques partout, aucune position gauche/droite en dur ; l'arabe n'est pas livré | Contrôle automatisé des propriétés physiques, essai en `dir="rtl"` | PRODUCT.md |
| E0.9 | **Clôture** : audit et critique Impeccable, relecture indépendante, `DESIGN.md` généré depuis l'application construite, mise à jour finale de `conventions/design-system.md` | Rapport d'audit sans problème bloquant, `DESIGN.md` écrit | Impeccable |

#### Journal de la relecture E0.R (2026-10-31)

Versions installées : Angular, CDK et Aria 22.2.3 ; Chart.js 4.5.1. **Non installés** : `ag-grid-community` / `ag-grid-angular`
(dernière 36.2.0) et `ng2-charts` (dernière 11.0.0, compatible Angular 22, pair `chart.js` ^3.4 ou ^4, CDK ≥ 22) ; à ajouter en E0.4.

Pages lues **en entier** (sources officielles : dépôt `angular/angular` `adev/src/content`, `angular/components`, ag-grid.com,
chartjs/Chart.js, valor-software/ng2-charts, w3.org) :

| Sujet | Pages | Retenu pour E0 |
|---|---|---|
| Signaux | vue d'ensemble, `linkedSignal`, `resource`, `effect`, `debounced` | `computed`/`linkedSignal` avant `effect` ; `effect` réservé aux API non réactives (canvas, stockage) ; `afterRenderEffect` pour un graphique ; `debounced` est expérimental |
| Formulaires | Signal Forms : vue d'ensemble, comparaison, contrôles personnalisés | Stable en v22 ; un composant partagé de saisie implémente `FormValueControl` / `FormCheckboxControl`, émet `touch` au `blur`, reçoit `invalid`/`errors`/`disabled` et ne valide pas lui-même ; schéma de validation livré avec le contrôle |
| Accessibilité | guide Angular « a11y », vue d'ensemble d'Angular Aria | Réutiliser `<button>`/`<a>` natifs ; Aria = directives sans style (accordéon, combobox, listbox, menu, onglets, barre d'outils, arbre, grille) ; `aria-current` sur le lien actif ; focus géré après navigation |
| CDK a11y | page `a11y` | `cdkTrapFocus`, `LiveAnnouncer`, `FocusMonitor`, `a11y-visually-hidden`, mixin `high-contrast` (`forced-colors`) |
| AG Grid 36.2.0 | thème (aperçu, couleurs et mode sombre, bordures) | `themeQuartz.withParams(...)` ; couleurs acceptent `var(--jeton)` et des références ; `backgroundColor` opaque ; `borderColor` par défaut = 15 % du texte sur le fond, à surcharger ; `rowBorder`, `columnBorder`, `headerRowBorder`, `wrapperBorder` ; schémas `colorSchemeDarkWarm` etc. ; modes via `data-ag-theme-mode` sur `<html>` |
| ng2-charts / Chart.js | README ng2-charts ; Chart.js « Colors » et « Accessibility » | `provideCharts(...)` ; l'exemple `ThemeService` du README utilise la syntaxe de Chart.js 2 (`xAxes`, `fontColor`) et **ne s'applique pas** à Chart.js 4 : l'habillage reste `chart-theme.ts` lu dans les jetons ; un `canvas` n'est accessible que par `role="img"` + `aria-label` ou contenu de repli |
| WCAG 2.2 | 1.4.1, 1.4.3, 1.4.6, 1.4.11, 2.4.7, 2.4.11, 2.4.13, 2.5.8 | Texte 4,5:1 (AA) et 7:1 (AAA) ; composants et graphiques 3:1 ; focus visible, non masqué, anneau ≥ 2 px et 3:1 ; cibles ≥ 24 px (le projet vise 44 px) ; jamais la couleur seule |
| Impeccable | `operate`, `mode-operate`, `craft-floor` | Mode Operate : un seul vocabulaire, états complets, chiffres tabulaires, thématiser sélection de texte, curseur, barres de défilement ; bannis : bordure colorée > 1 px sur un côté, dégradé de texte, nids de cartes |

**Non lu en entier (« non vérifié »), à lire à l'entrée de la tâche concernée** : Signal Forms (modèles, validation, état des champs,
soumission, migration) → E0.2 ; pages Angular Aria par composant → E0.2/E0.3 ; AG Grid (colonnes, accessibilité ARIA, clavier,
export, modules Community vs Enterprise, performance) et Chart.js (options, échelles, plugins) → E0.4 ; texte complet de WCAG 2.2
(seuls les critères listés ci-dessus ont été lus) ; `colorize.md` et `typeset.md` d'Impeccable → E0.1/E0.5.

### E1 — Socle de vérité : versions, rendu A2UI, qualification, démarrage

| ID | Tâche et fonction officielle | Preuve de terminé | Origine |
|---|---|---|---|
| E1.1 | Aligner toutes les dépendances IA sur la dernière stable (tableau du § 3), une montée à la fois ; **reste** : `@a2ui/web_core` 0.14.0 (attend une version de `@copilotkit/angular` qui l'épingle), `openai` 3.x **fait le 2026-11-01** avec `litellm` 1.109.0.dev2 (préversion adoptée par le propriétaire, épinglée dans `ia/pyproject.toml` ; 51 tests, Ruff et Pyright verts ; l'image de la passerelle `litellm/Dockerfile` passe aussi à v1.109.0-dev.2 par digest, à requalifier avec `litellm/test_providers.py` et les clés du `.env`, étape restante ; **Python 3.14.7** (dernière stable ; 3.15 n'existe qu'en candidate de version `rc1`, donc refusée, PR Dependabot #117 fermée) dans `ia/pyproject.toml`, `.python-version` et `ia/Dockerfile` : 51 tests, Ruff et Pyright verts, deux images construites et démarrées). Fait le 2026-10-31 : verrous Python et npm relevés (`core`/`shared` 1.83.0, `a2ui-middleware` 0.0.14) | Verrous à jour, tests et CI verts, note de migration par montée de version majeure | Politique de versions du 2026-10-31 |
| E1.2 | **Veille de versions** — état : **couches 1, 3 et 4 faites le 2026-10-31, couche 2 à faire par le propriétaire**. Retard de version toléré : **30 jours au plus** (décision du 2026-10-31), hors blocages expliqués. Cinq couches complémentaires et gratuites : (1) **[FAIT]** à l'**ouverture de chaque tâche IA** et au moins une fois par mois, un relevé « verrouillé / dernière stable / préversion » du service IA (PyPI) et de `frontend/` et `copilot-runtime/` (npm), rejoué par `node scripts/ia/veille-versions.mjs` (option `--strict` : échoue s'il reste un retard non expliqué ; les retards expliqués sont déclarés dans le script) ; (2) **abonnement aux publications** (« Watch → Releases ») des dépôts `langchain-ai/langchain`, `langchain-ai/langgraph`, `langchain-ai/deepagents`, `CopilotKit/CopilotKit`, `ag-ui-protocol/ag-ui`, `a2ui-project/a2ui`, `BerriAI/litellm`, `Arize-ai/openinference`, ainsi que de leurs journaux de modifications ; (3) **[FAIT]** **Dependabot** : `.github/dependabot.yml` couvre désormais aussi `ia/` (écosystème `uv`), `copilot-runtime/` (npm) et les images Docker `ia/` et `copilot-runtime/`, chaque mois. Une PR Dependabot lance la CI automatiquement : accepté par le propriétaire le 2026-10-31 (Q19) ; `frontend/` reste trimestriel, le script de la couche 1 couvre ses paquets IA ; (2) abonnement : sur chaque dépôt, **Watch → Custom → Releases**, gratuit sur un compte GitHub gratuit d'après la documentation de GitHub ; (5) **veille des pratiques** : à chaque revue mensuelle, relire les nouveautés de sécurité et de conception des interfaces générées et des agents (OWASP GenAI, journaux de CopilotKit, d'AG-UI, d'A2UI, de LangChain, LangGraph et Deep Agents) et consigner ici ce qui change une règle des conventions (règle inscrite dans `conventions/agent-ui.md` ; sources à confirmer à la première revue) ; (4) **[FAIT]** **relecture complète de la documentation officielle à l'entrée de chaque épopée** (§ 4.0 du plan, règle inscrite dans `AGENTS.md`, `CLAUDE.md` et `conventions/agents-ia.md`) | Couches 1 et 4 : script exécuté (30 composants, 0 retard inexpliqué) et règle écrite. Couche 2 : abonnements faits par le propriétaire. Couche 3 : fait | Politique de versions du 2026-10-31 |
| E1.3 | **V1c — qualification** : jeu de référence 24 sur 24 (dernier relevé exploitable 19/24, p50 9,09 s, p95 39,5 s), puis porté à **environ 200 cas** (décision du 2026-10-31) avec cas complexes, tri, questions à l'utilisateur, abstentions, refus et comparaisons ; objectif de latence **p95 ≤ 30 s** (décision du 2026-10-31) | Rapport reproductible, seuils tenus, jeu versionné | V1c, § 4 de l'ancien `docs/ia.md` |
| E1.4 | **V1e — CPU au démarrage** du service `ia` : l'import de `erp_rh_ia.app` coûte 14 s de calcul (dont 7 s `litellm`, 3 s `fastmcp.client`) ; premier démarrage à froid 110 s, puis 27 s. Pistes à lire dans la documentation de LiteLLM et de `langchain-litellm` : barème de coûts local (`LITELLM_LOCAL_MODEL_COST_MAP`), imports différés, client plus léger **à condition que `reasoning_content` reste transmis** | Mesure avant/après, une modification à la fois, raisonnement affiché inchangé | V1e |
| E1.5 | Contrôle documentation ↔ code en CI (versions, seuils, listes d'outils) ; supprimer les mentions périmées (12 000 jetons de résumé, « vérificateur ») | Contrôle vert, plus d'écart connu | « Transverse » de la vision longue ; analyse P0 |
| E1.6 | Écran d'accueil propre de l'assistant (CopilotKit masque l'accueil sur un fil fourni par l'application) ; lenteur ponctuelle à la reprise d'un fil (réponse arrivée côté serveur, affichée seulement au rechargement) | Accueil visible sur fil repris ; cause de la lenteur isolée et corrigée | V1b |
| E1.7 | **Partiel (2026-11-01)** : `.mcp.json` créé à la racine avec `docs-langchain`, `reference-langchain` (HTTP), `copilotkit-mcp` (SSE, `https://mcp.copilotkit.ai/sse`, adresse donnée par la page officielle pour Claude Code ; `/mcp` est celle des clients HTTP continu) et `angular-cli` épinglé en `@angular/cli@22` avec `--read-only` (sans épinglage, `npx` résout une ancienne version sans commande `mcp` et la connexion se ferme). Les quatre serveurs répondent ; la page de LangChain note que Deep Agents est couvert par `docs-langchain` (à vérifier à l'usage). **Installés aussi en portée utilisateur le 2026-11-01** (valables pour tous les projets, tous connectés) : `reference-langchain`, `copilotkit-mcp`, `angular-cli` épinglé en 22 (l'entrée existante sans épinglage ne se connectait pas), en plus de `langchain-docs`, `context7`, `playwright` (`@playwright/mcp`, dépôt `microsoft`, attribution non écrite dans le README) et `ag-grid` (`ag-mcp`, page officielle d'AG Grid) déjà présents. Serveur Phoenix (`@arizeai/phoenix-mcp` en maintenance, serveur distant `/mcp` recommandé) : non installé, dépend de l'instance Phoenix ; aucun serveur officiel confirmé pour Spring AI (documentation), FastAPI, Pydantic, PostgreSQL, Maven, Docker. **Reste** : approbation des serveurs du projet dans `claude`, et `npx skills add CopilotKit/CopilotKit/skills -y` (installe des fichiers de compétences tiers, à lancer avec l'accord du propriétaire). Outillage des assistants de développement, gratuit (décision du 2026-10-31) : serveurs MCP de documentation officiels ajoutés à `.mcp.json` du projet — **CopilotKit** (`https://mcp.copilotkit.ai/mcp`) avec ses compétences (`npx skills add CopilotKit/CopilotKit/skills` : `copilotkit`, `copilotkit-cli`), **LangChain** (`https://docs.langchain.com/mcp` pour LangChain, LangGraph et LangSmith ; `https://reference.langchain.com/mcp` pour l'API de tous les paquets ; Deep Agents n'est pas cité explicitement par la page : à vérifier à l'usage) et **Angular CLI** (`npx -y @angular/cli mcp`, option `--read-only` possible). Aucun serveur officiel dédié trouvé pour FastAPI, A2UI ni AG-UI (AG-UI publie `docs.ag-ui.com/llms.txt`) : **Context7**, déjà connecté, couvre FastAPI, Angular et LangChain | `claude mcp list` montre les serveurs ; une question de documentation reçoit une réponse sourcée | « Build with agents » (page lue), Q16 |
| E1.8 | **Ticket chez CopilotKit** (décision du 2026-10-31) : `CopilotA2UICatalog extends Catalog` et `createAngularCatalog` appellent `new Catalog(id, composants, fonctions)` alors que `@a2ui/web_core` ≥ 0.12.0 exige `protocolVersion` en deuxième paramètre ; demander l'adoption de `web_core` 0.14.0, et demander aux équipes AG-UI/CopilotKit à quelle date `ag-ui-a2ui-toolkit` et le middleware A2UI émettront le protocole v1.0. Le texte est prêt dans `docs/ia/ticket-copilotkit-web-core.md` ; l'envoi au dépôt public de l'éditeur reste un acte du propriétaire | Ticket ouvert, lien consigné ici | Décision 2026-10-31 |
| E1.9 | **Essai isolé de `@a2ui/angular`** — **TERMINÉ le 2026-10-31, concluant** (tests temporaires en navigateur, Angular 22.2.3, `@a2ui/angular` 0.13.0 avec `--legacy-peer-deps` et `@a2ui/web_core` 0.14.0 à côté de celui de CopilotKit, supprimés après coup). Prouvé : (1) rendu d'une surface **v1.0** et **v0.9** (sous-chemin `@a2ui/angular/v0_9`, protocole que l'agent produit aujourd'hui) ; (2) un composant de l'ERP (`KpiGrid`, notre classe existante) enregistré dans le catalogue via `createComponentImplementation` + `CatalogComponent`, avec liaison au modèle de données (`{path}` en v0.9, **`{"@path"}` en v1.0**) ; (3) un **pont** qui reçoit le contenu d'un message d'activité AG-UI `a2ui-surface` (clé `a2ui_operations`, comme le rendu intégré de CopilotKit) et le confie à `A2uiRendererService`. Constats : le catalogue v1.0 diffère (`Text.variant` = `caption`/`body`, syntaxe `@path`) ; chaque propriété arrive en `BoundProperty` (valeur résolue = `.value()`, et seules les propriétés dont le schéma est un type dynamique sont résolues) ; `provideMarkdownRenderer()` est obligatoire ; la surcharge `zod` 4 fait planter le formatage d'une **erreur** de validation (`errors.map`, API de zod 3) : à entourer d'un `try/catch` avec repli, et à signaler à A2UI. **Pas prouvé** : le branchement réel dans le chat (`registerRenderActivityMessage` pour `a2ui-surface` sans `a2ui.catalog`, qui désactive le rendu intégré et peut couper l'outil `generate_a2ui`), `DataTable` et `Chart` (même méthode), le retour des actions vers l'agent | Voir E1.10 | Décision 2026-10-31 |
| E1.10 | **Migrer le rendu des surfaces vers `@a2ui/angular` + `@a2ui/web_core` 0.14.0, protocole A2UI v0.9 adopté ; le v1.0 sera adopté quand il sera stable** (décision du propriétaire, 2026-10-31, après relevé de deux faits) : (1) la spécification A2UI v1.0 est étiquetée « **Candidate** » dans la documentation officielle (v0.9 : « Stable ») ; (2) le producteur de surfaces de l'agent, `ag-ui-a2ui-toolkit` (Python 0.0.5 et npm `@ag-ui/a2ui-toolkit` 0.0.5, dernières versions), n'émet que du **v0.9** (`"version": "v0.9"`, catalogue `v0_9`) ; passer l'agent en v1.0 sans lui demanderait une conversion écrite par nous, interdite par la règle « zéro code IA maison ». **Marche à suivre** : (a) ajouter `@a2ui/angular` + web_core 0.14.0 (installation `--legacy-peer-deps` tant que son pair Angular est `^21.2.5`) ; (b) pont `a2ui-surface` → `A2uiRendererService` par `registerRenderActivityMessage`, en vérifiant que l'agent produit toujours ses surfaces sans `a2ui.catalog` (propriété `a2uiCatalogAvailable`) ; (c) réécrire `DataTable`, `KpiGrid`, `Chart` comme `CatalogComponent` (coque mince ; leurs composants maison seront ensuite remplacés par AG Grid Community et `ng2-charts`, tâche E7.11) ; (d) renvoyer les actions (`actionHandler`) à l'agent ; (e) **veille du v1.0** : l'unique protocole produit (v0.9) est rendu par le sous-chemin `@a2ui/angular/v0_9` ; le v1.0 est adopté quand sa spécification passe de « Candidate » à stable **et** que le producteur d'AG-UI l'émet (question posée dans le ticket d'E1.8, surveillance par le script de veille) ; (f) entourer d'un `try/catch` avec repli l'appel `processMessages` (le formatage des erreurs de validation d'A2UI plante en zod 4) et signaler le défaut à A2UI | Parcours réel au navigateur avec un tableau, un graphique et des indicateurs ; tests du catalogue portés ; défaut zod signalé | Décision 2026-10-31 |

### E2 — Fiabilité de l'agent : middlewares LangChain et exécution LangGraph

Source : [middlewares préconstruits](https://docs.langchain.com/oss/python/langchain/middleware/built-in) (lue).

| ID | Tâche et fonction officielle | Preuve de terminé | Origine |
|---|---|---|---|
| E2.0 | **Passer l'agent sur `create_deep_agent` dès le début** (décision du 2026-10-31 : Deep Agents est un sur-ensemble de `create_agent`). Faits relevés dans la documentation officielle : il accepte `model`, `tools`, `system_prompt`, `middleware`, `subagents`, `skills`, `memory`, `permissions`, `backend`, `interrupt_on`, `response_format`, `state_schema`, `context_schema`, `checkpointer`, `store`, `cache`, `name` et **renvoie un `CompiledStateGraph`** ; il ajoute toujours `FilesystemMiddleware`, `SubAgentMiddleware` (sous-agent généraliste), `SummarizationMiddleware`, `PatchToolCallsMiddleware` et la mise en cache de prompts ; `TodoListMiddleware` reste opt-in (déjà présent chez nous). **Décision du propriétaire (2026-10-31) : on adopte tout ce que le harnais propose par défaut (bonnes pratiques éprouvées), sans rien retirer** : outils de fichiers (sur `StateBackend`, c'est-à-dire un système de fichiers **virtuel dans l'état de l'agent**, jamais le disque — `FilesystemBackend` et `LocalShellBackend` restent interdits), outil `task` et sous-agent généraliste, résumé automatique. **À prouver avant de fusionner** : (a) la liste exacte des outils exposés au modèle, mesurée ; (b) notre `SummarizationMiddleware` (40 000 jetons) remplace celui par défaut s'il porte le même nom ; (c) compatibilité avec `CopilotKitMiddleware`, `ag-ui-langgraph` et `LLMToolSelectorMiddleware` (30 outils MCP + outils du harnais : le sélecteur doit garder les outils du harnais ou le harnais doit être exempté de la sélection) ; (d) jeu de référence sans régression de justesse, de latence ni de coût. Le gain est de disposer d'emblée des sous-agents, des fichiers virtuels, des compétences et de la mémoire sans seconde migration | Agent migré, jeu de référence ≥ ancien, outils exposés au modèle listés et restreints, tests AG-UI verts | Décision 2026-10-31, E12.0 |
| E2.1 | `ToolErrorMiddleware` (`on_error`, `tools` ; exige `langchain>=1.3.14`) : une exception d'outil devient un message d'erreur **expurgé** que le modèle peut corriger ou qui arrête le run selon une matrice des erreurs métier | Matrice écrite, test : erreur métier, 403, délai, 500 | M1 |
| E2.2 | `ToolRetryMiddleware` et `ModelRetryMiddleware` (`max_retries`, `retry_on`, `on_failure`, `backoff_factor`, `jitter` ; comportement par défaut modifié en `langchain>=1.3.16`) : une **seule** politique de reprise avec LiteLLM (`max_retries=0` côté client) et MCP ; lecture seule rejouable, jamais une écriture | Budget total borné, test sans cascade de reprises | M1 |
| E2.3 | `ContextEditingMiddleware` + `ClearToolUsesEdit` (`trigger`, `keep`, `exclude_tools`, `placeholder`) : effacer les vieux résultats d'outils **sans toucher aux résultats du tour en cours** (cause de l'incident du résumé tronqué du 2026-10-27) | Jeu de référence sans régression, gain de jetons mesuré | M1 |
| E2.4 | `ModelFallbackMiddleware` : second filet sur un autre groupe de modèles, **en plus** du routage LiteLLM (première frontière) | Panne simulée du modèle principal : réponse rendue par le repli | M3 |
| E2.5 | `LLMToolEmulator` : outils simulés dans le banc d'évaluation, en remplacement des doubles de test maison ; modèles factices officiels (`GenericFakeChatModel`) et enregistrement de réponses (VCR) pour les tests sans réseau | Banc sans double maison | M3 |
| E2.6 | `ProviderToolSearchMiddleware` : **non applicable aujourd'hui** (réservé à Anthropic Claude 4+ et OpenAI gpt-5.5+, erreur sinon) ; **exclue définitivement** (Q3) | Décision prise (Q3) | M3 |
| E2.7 | Sortie structurée officielle : `response_format` avec `ToolStrategy` / `ProviderStrategy` pour le sélecteur d'outils, les surfaces et les réponses structurées ; revoir les pannes de format JSON observées par fournisseur ; revoir le mode de secours du sélecteur (en cas d'erreur d'analyse, tous les outils autorisés sont rendus : à garder seulement si aucune fuite de contexte ni régression n'est mesurée) | Cas de panne couvert, erreurs visibles, reprises bornées | T10, analyse « sortie structurée » |
| E2.8 | Exécution durable LangGraph ([tolérance aux pannes](https://docs.langchain.com/oss/python/langgraph/fault-tolerance), [exécution durable](https://docs.langchain.com/oss/python/langgraph/durable-execution)) : mode de durabilité, `RetryPolicy` par nœud, `timeout` de nœud, gestionnaire d'erreur de nœud, arrêt en douceur d'un run (`RunControl` : terminer le super-pas en cours puis sauvegarder) pour les redémarrages du service, cache de nœuds ; supprimer le **repli sur une mémoire de processus** quand la base IA est absente (non durable, il masque une panne de production) ; les tables du point de reprise restent créées par le `setup()` officiel de LangGraph au démarrage, le compte de la base IA gardant le droit de créer (décision Q14, 2026-10-31) | Reprise après arrêt du processus, test sur PostgreSQL réel | P2.4–P2.6, porte G2 |
| E2.9 | **Aucun plafond appliqué par nous** (décision du propriétaire, 2026-10-31) : retirer `ModelCallLimitMiddleware` et `ToolCallLimitMiddleware` (8 et 8 aujourd'hui) et ne fixer ni durée totale ni nombre de jetons par run. À lire dans la documentation de LangGraph avant de retirer : la limite de récursion (`recursion_limit`, 200 dans `agui.py`) est une limite du framework, pas la nôtre ; vérifier si elle peut être levée sans risque de boucle infinie ; un run anormalement long est détecté par les alertes d'E5.3 | Plafonds retirés, jeu de référence sans réponse tronquée, alerte sur durée anormale | Principe 4, Q8 |
| E2.10 | Flux d'événements de LangGraph : la documentation recommande la version 3 (`stream_events(version="v3")`, projections `messages`, `values`, `subgraphs`, `output`, introduite en 1.2) ; `ag-ui-langgraph` 0.0.47 appelle encore `astream_events` en version 2. Suivre ses mises à jour **sans réimplémenter le flux** ; flux personnalisé `get_stream_writer` pour l'avancement | Version de `ag-ui-langgraph` qui adopte la v3 identifiée, ou question posée à l'éditeur | Streaming (page lue) |
| E2.11 | Retour dans le temps et reprise (`get_state_history`, `update_state`, [time travel](https://docs.langchain.com/oss/python/langgraph/use-time-travel)) comme **aide à l'analyse d'incident**, sur données synthétiques | Procédure d'incident testée | Analyse « time travel » |

### E3 — Migration du backend Java Spring vers Python FastAPI (décision du 2026-10-31 : tout le backend, domaine par domaine)

**Décision du propriétaire (Q15, 2026-10-31)** : migrer **tout le backend**, **domaine par domaine**, en commençant par les
domaines transversaux (sécurité, utilisateurs, audit…), puis les domaines métier **un par un**. L'ADR (E3.1) reste à écrire
avant la première ligne : la migration contredit trois décisions en vigueur (« Spring reste l'autorité » ; serveur MCP en
Spring AI ; migrations Flyway) et les conventions écrites pour Java (`jpa.md`, `architecture.md`, `testing.md`, `swagger.md`,
`metrics.md`…), qu'il devra remplacer explicitement. Pendant la migration, **le backend qui sert un domaine fait autorité
pour ce domaine** (Spring tant qu'il n'est pas basculé, FastAPI ensuite). Les tâches sont des intitulés à instruire dans la
documentation officielle de FastAPI, pas des choix.

Domaines du backend actuel (nombre de fichiers Java relevé le 2026-10-31) : `common` (12), `auth` (73), `audit` (48),
`parametre` (13), `mcp` (14) ; domaines métier `function` (19), `equipe` (19), `chantier` (29), `employee` (37),
`heuresupp` (33), `paie` (111) ; 42 migrations Flyway.

| ID | Tâche | Preuve de terminé | Origine |
|---|---|---|---|
| E3.1 | **ADR** : motif (retenu : **outils IA natifs Python** — LangChain, LangGraph, Deep Agents, SDK MCP), cible (FastAPI, accès aux données, migrations Flyway ou Alembic, JWT RS256, audit), stratégie de bascule, règle « le backend qui sert un domaine fait autorité », conventions à remplacer, mise à jour des principes du § 1 | ADR approuvé | Demande 2026-10-31 |
| E3.1b | **Mise à jour des ADR et des conventions au moment où la bascule est décidée** (décision du 2026-10-31) : les ADR de `docs/adr/` et les conventions de `conventions/` sont réécrits pour refléter FastAPI et Python, **en gardant la même architecture et les mêmes conventions de code** (couches, nommage, tests, sécurité, audit, documentation), traduites dans l'idiome Python ; chaque règle supprimée ou changée est listée dans l'ADR avec sa raison | ADR et conventions à jour, aucune convention Java restante une fois Spring retiré | Décision 2026-10-31 |
| E3.2 | Inventaire exhaustif par domaine : endpoints, entités, règles de calcul (paie surtout), permissions, tâches planifiées, tests existants dont la couverture est à égaler | Inventaire versionné | Idem |
| E3.3 | Stratégie de bascule : proxy qui route chaque domaine vers l'ancien ou le nouveau backend, même base PostgreSQL pendant la transition, **tests de contrat identiques des deux côtés**, critère de parité chiffré (notamment pour la paie), retour arrière | Plan de bascule approuvé | Idem |
| E3.4 | Cible technique et prototype sur le premier domaine : FastAPI, accès aux données, migrations, authentification, observabilité, CI, image Docker (règle du `docker compose` unique) | Prototype du domaine `common` servi par FastAPI | Idem |
| E3.5 | **Tranche transversale, dans cet ordre** : `common`, `auth` (sécurité, utilisateurs, rôles, permissions, jetons), `audit`, `parametre`, puis le serveur MCP (SDK MCP Python officiel au lieu de Spring AI ; les outils de chaque domaine le rejoignent avec leur domaine) | Chaque domaine servi par FastAPI, tests de parité verts, domaine Java retiré | Idem |
| E3.6 | **Domaines métier, un par un** (ordre **validé par le propriétaire le 2026-10-31**, du moins risqué au plus critique) : `function`, `equipe`, `chantier`, `employee`, `heuresupp`, `paie` ; un domaine n'est basculé qu'après parité prouvée, et ses outils MCP migrent avec lui | Idem, par domaine | Idem |
| E3.7 | Retrait final de Spring (dépendances, image, CI, conventions Java) | Aucune trace de Spring dans le dépôt, CI verte | Idem |

### E4 — Rôles, départements, hiérarchie et sécurité par champ (demande du 2026-10-31)

**À exécuter avant E6** malgré son numéro : E6 (sécurité par fiche de poste) consomme le modèle qu'E4 établit, et le
masquage est une règle métier côté Spring (principe 5). Le code actuel contient des rôles, des permissions et un résolveur de
permissions effectives (`auth/`) avec refus de permissions ; aucune entité de département ni de hiérarchie n'a été trouvée
par nom de fichier (à confirmer par E4.1).

**Décisions du 2026-10-31 (Q17)** : le contrôle d'accès repose sur les **rôles (RBAC), les permissions et les droits par champ** ; les départements et la hiérarchie décrivent l'organisation (organigramme, rattachements) et **ne limitent pas** les données vues. Champs sensibles, masqués par défaut et visibles avec une permission dédiée (assistant compris) : **rémunération** (salaire, primes, retenues, net), **identité** (CIN, date de naissance, situation familiale), **banque et social** (RIB/IBAN, CNSS), **contact** (adresse, téléphone, courriel personnel).

| ID | Tâche | Preuve de terminé | Origine |
|---|---|---|---|
| E4.1 | Inventaire du modèle actuel (rôles, permissions, `EffectivePermissionResolver`, rôles système) face au besoin ; liste des champs sensibles par entité (Q17) | Document d'écart signé | Demande 2026-10-31 |
| E4.2 | Départements et hiérarchie (organigramme : rattachements, chaîne de responsables, équipes ; information seulement, sans effet sur les droits) : modèle de données, migrations Flyway, requêtes récursives PostgreSQL | Migration sur base vierge et mise à niveau ; arbre testé | Idem |
| E4.3 | Permissions par rôle appliquées dans les services (liste, détail, agrégat, export) ; **pas de périmètre par département ni par hiérarchie** (Q17) | Tests négatifs : sans la permission, ni la donnée, ni l'agrégat, ni le tri | Idem, T2.1–T2.2 |
| E4.4 | **Sécurité par champ** : déclaration, par rôle, de chaque champ (visible, masqué, écriture refusée), appliquée **dans les projections Spring** et donc à l'interface, aux exports et aux outils MCP ; le champ interdit est absent (jamais remplacé par une valeur factice qui tromperait un agent), y compris dans tri, filtre, agrégat et message d'erreur | Appel direct sans permission : aucune fuite, tri et agrégat compris | T2.3 |
| E4.5 | Écran d'administration des rôles, départements et champs ; journal d'audit des changements et des accès aux champs sensibles | Parcours testé, audit lisible | Idem |
| E4.6 | Raccordement de l'IA : E6.1 à E6.3 s'appuient sur ce modèle ; l'agent n'obtient que ce que l'utilisateur peut voir | Jeu adversarial E6.5 vert | E6 |

### E5 — Confidentialité, traces et conformité (avant toute donnée réelle)

| ID | Tâche et fonction officielle | Preuve de terminé | Origine |
|---|---|---|---|
| E5.1 | **Masquage : décision du 2026-10-31, il est appliqué uniquement côté backend (projections par champ, E4)**, de sorte que ni le service IA ni le modèle ne reçoivent les champs interdits. `PIIMiddleware` (types natifs `email`, `credit_card`, `ip`, `mac_address`, `url` ; CIN, RIB/IBAN marocains et téléphones demandent un `detector` personnalisé) n'est **pas** ajouté pour l'instant : tâche reportée en E13.9 | Cas synthétiques CIN, RIB, téléphone, courriel : jamais vus du modèle ni des traces | M2 |
| E5.2 | Politique de traces LangChain (`configure_trace_policy`, `omit_payload`) + masquage OpenInference + **preuve sur une trace Phoenix réelle** qu'aucune donnée sensible n'apparaît ; rétention **90 jours** (décision du 2026-10-31), annotation | Trace synthétique inspectée de bout en bout | M2, T3.4, analyse P1 |
| E5.3 | Observabilité complète (T3.4) : traces du clic à la base, alertes, corrélation `requestId`/`threadId`/`runId`/`toolCallId` dans l'audit (sans les mettre en étiquettes de métriques), évaluation des coûts par run | Tableau de bord et alertes, audit corrélé | T3.4, analyse « neuf piliers » |
| E5.4 | Conformité (T3.6) : registre des systèmes, fiche du système, analyse d'impact, notice, durées de conservation (loi 09-08, NIST AI RMF, ISO/IEC 42001, OWASP LLM) | Documents approuvés | T3.6 |
| E5.5 | Exploitation (T3.7) : procédure d'incident, changement de modèle, prompts versionnés, SBOM et analyse de vulnérabilités du service IA, interrupteur d'arrêt, sauvegarde et restauration des bases IA (`ia-db`, `litellm-db`, Phoenix, SQLite du runtime) | Exercice de restauration réussi | T3.7, analyse « exploitation » |
| E5.6 | Conservation dans la passerelle (T2.8) : le contenu des messages n'est pas conservé par LiteLLM (vérifier journaux de dépense et rétention) | Contrôle automatisé | T2.8 |
| E5.7 | Chiffrement des points de reprise : `EncryptedSerializer` (AES) du checkpointer LangGraph, clé hors dépôt, rotation documentée ; purge fine des anciens points avec `aprune` | Base `ia-db` illisible sans clé, purge testée | LangGraph persistance (page lue) |

### E6 — Sécurité par fiche de poste (jalon J2)

| ID | Tâche | Preuve de terminé | Origine |
|---|---|---|---|
| E6.1 | Modèle de périmètres (T2.1) et périmètres appliqués aux outils MCP et aux vues (T2.2) | Tests négatifs par poste | T2.1, T2.2 |
| E6.2 | Projection du salaire (T2.3) : `EMPLOYEE_READ` sans `PAIE_READ` ne révèle ni salaire, ni tri, ni agrégat, ni message d'erreur | Tests d'appel direct sans permission | T2.3, analyse « identité » |
| E6.3 | Catalogue d'outils filtré par fiche de poste (T2.4) | Un utilisateur ne voit que ses outils | T2.4 |
| E6.4 | Budgets et quotas par utilisateur et par poste avec les **budgets natifs de LiteLLM** (T2.5) ; plafonds par run | Dépassement refusé et audité | T2.5 |
| E6.5 | Jeu adversarial (T2.6) : injections directes et indirectes (champs de données piégés), exfiltration par lien ou image, contournement de périmètre, texte du modèle rendu comme texte ; outil retenu : **PyRIT** (Microsoft, licence MIT, Python ; décision du 2026-10-31), dont la documentation officielle est lue en entier avant adoption, complété par des cas propres à l'ERP rejoués sous pytest | Issue attendue déterministe par cas, rejoué à chaque changement | T2.6, OWASP LLM01 |
| E6.6 | Affichage de la période, du périmètre et de la définition avec chaque chiffre principal (reste de T2.7, sans vérificateur) : les outils fournissent déjà `definitions`, l'interface doit les montrer | Capture et test | T2.7 |
| E6.7 | Contrat de vue unique entre Spring, service IA et Angular, généré (T2.9) | Un seul schéma source | T2.9 |
| E6.8 | **Accueil par défaut par fiche de poste** (décision du propriétaire, 2026-11-01 : attendre E6) : à la création de la fiche de poste par E6, ajouter une couche « accueil de la fiche » entre le choix de l'utilisateur et « tous les indicateurs autorisés » (table `accueil_fiche`, permission d'administration, écran dans l'administration), migrer les comptes existants sans changer ce qu'ils voient, mettre à jour `docs/accueil/README.md` et `docs/rbac/accueil.md` | Un utilisateur sans choix voit l'accueil de sa fiche ; son choix personnel l'emporte ; tests d'intégration | Décision 2026-11-01 (accueil, E0.5b) |

### E7 — Résorption du code maison (tâches T21 à T31 ; T22 est faite)

Chaque ligne remplace une pièce maison par la fonction officielle ; la pièce maison est supprimée dans la même tâche.

| ID | Pièce maison → fonction officielle | Preuve de terminé | Origine |
|---|---|---|---|
| E7.1 | `contexte.py` → `dynamic_prompt` + invite ou ressource MCP de Spring AI (`@McpPrompt`) lue par l'adaptateur MCP ; contexte d'exécution immuable par `context_schema` / `ToolRuntime` (page [runtime](https://docs.langchain.com/oss/python/langchain/runtime)) | `contexte.py` supprimé, droits non élargis | T24 |
| E7.2 | `memoire.py` (préfixe de fil, purge) → espaces de noms du `Store` LangGraph (`AsyncPostgresStore`) ; **l'expiration (TTL) n'est pas documentée** pour le `Store` : tâche `pg_cron` ou équivalent gratuit | Isolation testée, expiration prouvée | T25 |
| E7.3 | `jeton_agent` et encodeur JWT → échange de jetons RFC 8693 (Spring Authorization Server, client OAuth2) | Anciens chemins supprimés, audience et expiration testées | T26 |
| E7.4 | `agui.py` (authentification, validation, flux SSE) → `add_langgraph_fastapi_endpoint` d'`ag-ui-langgraph` (présent en 0.0.47) avec dépendances FastAPI ; outils par requête par les crochets dynamiques | `agui.py` réduit aux dépendances | T27 |
| E7.5 | `evaluation.py` (rejoueur) → `openevals` (évaluateurs de réponses : juge LLM, comparaison JSON, similarité, exactitude) et `agentevals` (trajectoires : `trajectory_match_mode` strict, unordered, subset, superset ; juge de trajectoire ; graphes LangGraph) en appels directs sous pytest. **Vérifié dans leurs README** : les deux évaluateurs fonctionnent sans LangSmith, qui n'est requis que pour leurs intégrations pytest/Vitest et `evaluate` (suivi d'expériences) ; les juges LLM utilisent par défaut `langchain_openai`. **Risque** : `agentevals` est dormant (E1.1) | Rejoueur supprimé, jeu de référence rejoué par pytest | T28 |
| E7.6 | `filtrer_config.py`, `enregistrer_cles.py`, `test_providers.py` → `include` de fichiers de configuration LiteLLM par fournisseur, sondes natives, clés virtuelles par l'API gérée | Scripts supprimés | T29 |
| E7.7 | Composants maison (`DataTable`, `KpiGrid`, `Chart`, `QuestionUtilisateur`, `FilAssistant`) → AG Grid Community ou TanStack Table, `ng2-charts`, interruptions natives CopilotKit (`registerHumanInTheLoop`, `injectInterrupt`) | Composants maison supprimés, accessibilité conservée | T30 |
| E7.8 | `serveur.mjs` (authentification `/auth/me`, routes, propriété du fil) → gestionnaire officiel `createCopilotExpressHandler` (`@copilotkit/runtime/v2/express`) avec crochets `hooks.onRequest` (vérifier le jeton, répondre 401), `onBeforeHandler` (propriété du fil), `onError`, `cors`, `forwardHeaders`. **Règle officielle** : sans Intelligence, rien ne lie un fil à un utilisateur ; il faut une table de propriété (`thread_id`, `user_id`) vérifiée sur toute route portant un `threadId` et sur `agent/run` / `agent/connect` ; `threads/list` filtré côté serveur ; `SqliteAgentRunner` répond 422 sur les routes de lecture et n'offre aucune autorisation ; `identifyUser` est réservé à Intelligence | Fils réservés à leur propriétaire, testé (accès croisé refusé) | T31 |
| E7.9 | `surfaces.py` (liste → tableau ou graphique) → motif A2UI à schéma fixe (`a2ui-fixed-schema`) ; évaluer MCP Apps (`provideMCPApps`, `@copilotkit/angular/mcp-apps`) pour que l'interface vienne du serveur MCP | Décision mesurée puis migration | T23 |
| E7.10 | Liste titrée des anciennes conversations : `injectThreads` (`threads`, `isLoading`, `listError`, `startNewThread`, renommer, archiver, supprimer) et `CopilotThreadsDrawer` **dépendent d'Intelligence** (le tiroir est verrouillé sans la fonction `threads` de la licence) ; voie retenue (Q10, 2026-10-31) : **table de fils tenue par l'ERP** (fil, propriétaire, titre), vérifiée par les crochets du runtime (table de propriété de E7.8) ; code à dater et à retirer si l'éditeur offre une voie gratuite | Liste, titre, suppression, isolation par utilisateur | T21 |
| E7.11 | **Absorbée par E0.4** (décision du 2026-10-31 : AG Grid Community et `ng2-charts` dans toute l'application font partie de la refonte du frontend) | Voir E0.4 | Q21 |

### E8 — Conversations et mémoire

| ID | Tâche et fonction officielle | Preuve de terminé | Origine |
|---|---|---|---|
| E8.1 | Conversations multi-tours (T3.2) : isolation, **suppression par l'utilisateur**, reprise après redémarrage, expiration de l'historique SQLite du runtime (aucune aujourd'hui) | Tests de suppression et d'expiration | T3.2, V1b |
| E8.2 | Contexte d'écran (T3.3) : conserver `connectAgentContext` en lecture seule et **revalider côté serveur** ; ne jamais le présenter comme un état partagé | Test : filtre falsifié refusé | T3.3 |
| E8.3 | Mémoire longue (P4.6), politique décidée le 2026-10-31 : l'assistant retient **des préférences et des faits métier** (par exemple « je suis responsable du chantier X »), avec **consentement**, consultation, correction, suppression et expiration ; mémoire par utilisateur dans le `Store` LangGraph (`AsyncPostgresStore`, espaces de noms par utilisateur ; expiration à programmer, le `Store` n'ayant pas de TTL documenté) ; un fait RH n'est retenu qu'avec l'accord explicite de la personne et reste soumis aux projections par champ (E4) ; mémoire `AGENTS.md` de Deep Agents (E12.5) à rapprocher | Tests de consentement, de consultation, d'oubli et d'expiration | P4.6, Q5 |
| E8.4 | Reconnexion du flux et rattrapage (P3.4) : `AG-UI Streams` (CopilotKit Intelligence) et `join` / `rejoin` de LangChain (serveur d'agent LangGraph à licence) sont **exclus** (Q3) ; la liste des conversations est couverte par E7.10 (Q10) ; le rattrapage d'un flux coupé n'a **pas de voie gratuite officielle** : au rechargement l'utilisateur retrouve sa conversation et relance sa question ; à rouvrir si un besoin est mesuré | Pas de double exécution au retour du réseau | P3.4 |
| E8.5 | Séparation des trois mémoires : état de fil (checkpointer), mémoire inter-fils (`Store`), contexte immuable d'exécution ; documenter la frontière | Schéma d'état formalisé | Analyse LangGraph |

### E9 — Interface CopilotKit complète (Angular)

**Choix du client d'agent (analyse du 2026-10-31, documentation officielle lue).** Angular seul ne fournit **aucune** interface
d'agent : sa page IA ne liste que Genkit, Firebase AI Logic et l'API Gemini, sans composant de discussion ni AG-UI/A2UI.
`@langchain/angular` 1.2.9 (`injectStream`, licence MIT) offre flux, messages, appels d'outils, interruptions, outils sans
interface, branches et fils sous forme de signaux, mais **sans composants visuels**, et il parle au **serveur d'agent LangGraph**
(ou à un serveur qui implémente son « Agent Streaming Protocol », routes `/threads/:id/commands` et `/threads/:id/stream`) ;
or le serveur d'agent exige en production une clé de licence (`LANGGRAPH_CLOUD_LICENSE_KEY`) et un accès sortant à
`beacon.langchain.com`, et l'implémenter nous-mêmes serait du code maison. Notre service FastAPI parle **AG-UI** (norme ouverte)
via `ag-ui-langgraph`, que CopilotKit consomme avec ses composants (discussion, outils, interruptions, A2UI). **Conclusion :
CopilotKit Angular reste le client** ; pour les surfaces A2UI, le rendu officiel `@a2ui/angular` est la voie de dépassement du
blocage de `@a2ui/web_core` (Q20).

**Comparaison fonction par fonction (2026-10-31, README et documents de `@langchain/angular` lus ; spécification A2UI lue).**
`@langchain/angular` ne porte **pas** A2UI : le mot n'apparaît dans aucun de ses documents ni dans la page d'accueil du
frontend LangChain, qui ne cite que des bibliothèques React (AI Elements, assistant-ui) et OpenUI. Le rendu A2UI pour Angular est
`@a2ui/angular`, un projet distinct.

| Fonction | CopilotKit Angular | `@langchain/angular` |
|---|---|---|
| Composants de discussion prêts à l'emploi | Oui (`CopilotChat`, `CopilotSidebar`, `CopilotPopup`) | Non (sans interface ; bibliothèques citées : React) |
| Flux, messages, état en signaux | Oui (`injectAgentStore`) | Oui (`injectStream`) |
| Rendu des appels d'outils | `registerRenderToolCall` | `stream.toolCalls` (à habiller soi-même) |
| Outils côté navigateur | `registerFrontendTool` | Outils sans interface (`headless-tools`) |
| Interruptions et approbation | `registerHumanInTheLoop`, `injectInterrupt` | Interruptions en signaux |
| A2UI | Oui (catalogue, `createAngularCatalog`) | Non mentionné |
| MCP Apps | Oui (`provideMCPApps`) | Non mentionné |
| Branches, retour dans le temps | Non vu dans les guides lus | Oui |
| Sous-agents, fichiers multimédias en flux | Non vu | Oui (`subagents-subgraphs`, `injectFiles`) |
| Fils et mémoire | Fils et mémoire exigent Intelligence | Fils durables via le serveur d'agent (licence en production) |
| Protocole | AG-UI (norme ouverte) | « Agent Streaming Protocol » du serveur d'agent LangGraph |

**A2UI n'est pas un transport.** La documentation d'A2UI le dit : « AG-UI is a transport protocol… A2UI is a UI format… use AG-UI as
the pipe, A2UI as the content ». Les transports d'A2UI sont A2A et AG-UI (stables) ; REST, WebSocket et SSE sont « planned » ou
« proposed », sans exemple. Supprimer AG-UI obligerait à écrire nous-mêmes le cycle d'un run, le texte en flux, les appels
d'outils, l'état et les interruptions. **Décision : AG-UI transporte, A2UI décrit l'interface.** Seule couche supprimable
autrement : le service Node `copilot-runtime`, mais CopilotKit réserve la connexion directe au développement
(`agents__unsafe_dev_only`) ou à l'offre entreprise (`selfManagedAgents`).

Source : [exemples Angular](https://docs.copilotkit.ai/angular/features) (41 entrées, lue) et [référence](https://docs.copilotkit.ai/reference/angular) (lue). Aucune n'est libellée bêta ; aucune n'indique si elle exige Intelligence.

| ID | Fonction CopilotKit | Preuve de terminé | Origine |
|---|---|---|---|
| E9.1 | Rendu des appels d'outils : `registerRenderToolCall` pour les 30 outils MCP (renderers partagés par domaine) + renderer universel de repli (« Tool Rendering ») ; chaîne de raisonnement et d'outils (`tool-rendering-reasoning-chain`) | Chaque outil a un rendu lisible, accessible | Copilot future |
| E9.2 | Raisonnement : composant de message de raisonnement personnalisé (`reasoning-custom`) aux couleurs Staport | Rendu et test | Copilot future |
| E9.3 | Outils frontend : `registerFrontendTool` (synchrone et asynchrone) pour ouvrir une vue ou préparer un filtre, **réversibles** ; `registerComponent` (l'agent affiche un composant Angular précis) ; le serveur reste l'autorité | Parcours « ouvrir la vue filtrée » testé, droits revérifiés | P3.3, Copilot future |
| E9.4 | État partagé agent ↔ interface : lecture seule, lecture-écriture, flux de deltas (`agent.setState`, `shared-state-*`) sur **un** parcours concret ; parcours retenu (Q6, 2026-10-31) : **filtres de vue pilotés par l'agent**, ajustables par l'utilisateur, le serveur revalidant toujours les droits ; lecture seule côté données | Conflit et validation testés | Copilot future |
| E9.5 | Interface sans chat (« headless ») pour l'espace plein écran : `injectAgentStore`, `registerRenderToolCall`, messages et surfaces (J4, T8) ; `CopilotActivity` + `registerRenderActivityMessage` pour les cartes d'activité ; **parité** de rendu entre le panneau latéral et l'espace immersif ; les suggestions de départ ne divulguent aucune donnée RH et n'ouvrent aucun fil persistant | Espace immersif livré | J4 |
| E9.6 | Interruptions : `injectInterrupt` (dans le chat et hors chat) et `registerHumanInTheLoop` (par outil) ; dépend de E10 | Voir E10 | Copilot future |
| E9.7 | Pièces jointes : `[attachments]` de `<copilot-chat>` (`enabled`, `accept`, `maxSize`, `onUploadFailed`, `onUpload`) ; **par défaut les fichiers partent en base64** (inadapté aux gros fichiers sans `onUpload`) et le modèle comme le backend doivent accepter chaque type ; voix en temps réel (capture audio, navigateur seulement après hydratation) ; **cadrer consentement, types de fichiers, antivirus, données RH** ; décision (Q11, 2026-10-31) : pièces jointes **plus tard, cadrées**, après la sécurité et le pilote ; voix **en fin de parcours** (E13.8) | Cadre écrit puis prototype | Copilot future, J9 |
| E9.8 | **MCP Apps abandonné** (décision du propriétaire, 2026-10-31 : l'interface libre passe par E9.9). Vérifié dans la documentation officielle de MCP : l'outil déclare une ressource `ui://` (HTML) que l'hôte affiche dans une iframe isolée, avec un échange JSON-RPC par `postMessage` ; la prise en charge côté Spring AI ou SDK Python n'a pas été lue, sans conséquence puisque abandonné. WebMCP (`webmcp` sur `registerFrontendTool`) : **non adopté pour l'instant (décision du 2026-10-31)**, expérimental, exige Chrome 149 et le brouillon d'un groupe communautaire du W3C ; ses annotations ne sont pas des contrôles de sécurité | Décision écrite (Q7) | T23, Copilot future |
| E9.9 | **Interface générative ouverte autorisée (décision du propriétaire, 2026-10-31)** : l'agent compose déjà librement des surfaces avec tout le catalogue de base A2UI plus les composants de l'ERP, et peut en plus produire du HTML/CSS/JavaScript quand cela ne suffit pas. `conventions/agent-ui.md` est modifiée en conséquence (l'interdiction du 2026-10-23 était une précaution sans décision consignée). Mise en œuvre par le moteur officiel `openGenerativeUI` de CopilotKit (iframe isolée sans accès à l'origine) et `sandboxFunctions` étroites qui revérifient les droits côté serveur ; relire la page « frontend-tools-generative-ui » à l'entrée de l'épopée | Prototype avec une vue ouverte, fonctions d'hôte testées avec des cas négatifs (droits, secrets), repli sur le catalogue | M4, `progression-ui` |
| E9.10 | Récupération des surfaces A2UI invalides (`a2ui-recovery` : boucle de validation et reprise avant repli) ; catalogue fermé versionné | Surface invalide : reprise puis repli, testé | T16 |
| E9.11 | Capacités de la bibliothèque : `injectCapabilities`, `injectCopilotKitConfig`, directive `CopilotKitAgentContext`, `selfManagedAgents` ; contrat de production (zoneless, hydratation, SSR, nettoyage) de la page « production-lifecycle » ; budget de taille du paquet (peut dépasser 1 Mo) | Contrat appliqué, budget réglé | Copilot future |
| E9.12 | Inspecteur CopilotKit : monté automatiquement par `@copilotkit/angular` ; `enableInspector: false` dans `provideCopilotKit` le coupe (import dynamique, absent des constructions de production d'après la documentation : à vérifier dans le paquet construit) ; ses « Rich Threads » exigent Intelligence (exclu, Q3) ; débogage de la connexion : `GET {runtimeUrl}/info`, signal `runtimeConnectionStatus` | Désactivé en production, vérifié | Copilot future |
| E9.13 | Accessibilité et appareils (P3.5) : clavier, focus, lecteur d'écran, mobile, thèmes, mouvement réduit, repli texte, IA indisponible ; parcours Playwright + axe | Rapports verts, revue visuelle | P3.5 |
| E9.14 | Mascotte Rive (décision déjà prise, jamais livrée) : états abstraits liés à `threadId`/`runId`, masquable, remplaçable par un état statique | Adaptateur et tests ; poids mesuré | ADR 0002, J4 |
| E9.15 | Déploiement des modes par domaine (matrice M0 à M3 de l'ancien `progression-ui.md`) : Chantier, Employé, Paie, Équipe, Fonction, Rapport, **Heures supplémentaires**, Administration, avec la porte d'activation à six preuves (utilité, droits, continuité, interface, robustesse et coût, revue) | Une revue par domaine et par mode | Progression UI |
| E9.16 | Personnalisation : styles CSS et emplacements (« slots ») pour le thème Staport (déjà en partie) ; fenêtre flottante `CopilotPopup` si utile | Thème complet | Copilot future |

### E10 — Écritures et approbation humaine

**Sans réponse à Q4, cette épopée reste préparée et non activée** : aucune écriture n'existe aujourd'hui.

| ID | Tâche et fonction officielle | Preuve de terminé | Origine |
|---|---|---|---|
| E10.1 | Choisir le **premier outil d'écriture** et la politique d'approbation (qui approuve, quoi, pour combien de temps) | Décision écrite (Q4) | J6 |
| E10.2 | `HumanInTheLoopMiddleware` (`interrupt_on`, `interrupt_mode` ; exige un checkpointer, présent) : approuver, modifier ou refuser un appel d'outil ; **incompatible avec `ShellToolMiddleware`** | Parcours approuver / modifier / refuser testé | M4 |
| E10.3 | `interrupt()` de LangGraph avec `response_schema` (exige `langgraph>=1.2.12`) et `Command(resume=...)` sur le même `thread_id` ; règles officielles : le nœud est **rejoué depuis le début** à la reprise, effets antérieurs idempotents, jamais d'`interrupt()` dans un `try/except` générique | Pause persistée, reprise après redémarrage | M4, analyse LangGraph |
| E10.4 | Côté Spring : identifiant de commande stable, déduplication dans le domaine, vérification de l'issue après délai, audit, approbation **liée** à acteur, action, arguments, version et expiration ; revérification des droits à la reprise | Crash avant et après validation, deux reprises concurrentes, approbation expirée | P2.5, analyse « checkpoints » |
| E10.5 | Tâches longues et artefacts : l'outil rend un `jobId`, un état et une référence d'artefact (jamais le binaire) ; téléchargement réautorisé, expiré, purgé ; motif « outbox » si la fraîcheur d'un index l'exige | Rapport PDF asynchrone de bout en bout | Analyse « latence », innovations P2 |
| E10.6 | Documents RH avec différence prévisualisée et approbation humaine (J6) | Diff approuvé avant effet | J6 |

### E11 — Connaissances documentaires (RAG) et assistant réglementaire (J6, J7)

Rien n'existe dans le code : seule l'extension pgvector est installée. Les chiffres et effectifs restent servis par les outils
métier ; le RAG ne sert que des documents publiés et autorisés.

| ID | Tâche | Preuve de terminé | Origine |
|---|---|---|---|
| E11.1 | Gouvernance du corpus : responsable, public autorisé, finalité, classification, ACL, droits d'usage, version, dates d'effet, retrait ; **corpus retenus (Q12, 2026-10-31) : tous** — aide métier de l'ERP, textes réglementaires (Code du travail, CNSS) et procédures internes Staport, introduits un par un du moins au plus risqué ; **tout le RAG est isolé dans cette épopée** ; exclusions par défaut (secrets, exports, données nominatives, prompts, brouillons) | Liste approuvée | P4.1, D1 |
| E11.2 | Référence sans génération : recherche plein texte et par code métier, jeu de questions annotées (français, arabe, darija, Arabizi ; ambiguïtés, sans réponse, sources périmées, interdites) | Rappel@k et MRR mesurés | P4.2 |
| E11.3 | Migrations Flyway (sources, génération, passages, droits, tâches d'ingestion), ingestion idempotente, extraction bornée, quarantaine, publication atomique ; OCR isolé (Tesseract) seulement si le texte manque | Base vierge et mise à niveau, reconstruction d'index | P4.3 |
| E11.4 | Embeddings (modèle gratuit et local à choisir), recherche **côté Spring** filtrée par droits **avant** le modèle, hybride lexical + vecteur (fusion de rangs RRF), reranking si le gain est mesuré ; index ANN testé avec les vrais filtres ; RLS PostgreSQL comme défense en plus | Aucune fuite déterministe | P4.4, `rag.md` |
| E11.5 | Réponse citée : validation des identifiants et extraits, liens protégés, abstention si sources insuffisantes, date d'effet affichée ; sources traitées comme données non fiables | Citations inventées rejetées | P4.5 |
| E11.6 | Retrait d'une source ou d'un droit : propagation aux caches, passages, résumés et checkpoints ; restauration d'une sauvegarde réappliquant les retraits | Test de retrait de bout en bout | P4.6, `rag.md` |
| E11.7 | Comparatif référence / hybride / reranking, charge et coût ; **GraphRAG / Neo4j seulement** si des questions multi-sauts échouent malgré la recherche hybride et qu'un ADR le justifie | Décision mesurée | P4.7, G4 |
| E11.8 | Assistant réglementaire (J7) : corpus versionné (Code du travail, CNSS) avec provenance officielle, juridiction et date d'effet ; jamais un avis juridique | Corpus approuvé et évalué | J7 |
| E11.9 | Explication d'un rejet d'import de paie : outil en lecture sur `PaieImportService.analyser`, même résultat que l'assistant d'import existant | Même verdict que l'assistant d'import | Innovations P1 |
| E11.10 | Quasi-doublons de fonctions et de référentiels : normalisation + `pg_trgm` avant comparaison par embeddings ; candidats seulement, jamais de fusion automatique | Précision mesurée sur libellés validés | Innovations P2 |

### E12 — Agents spécialisés et fonctions de Deep Agents

Sources : toutes les pages Deep Agents de l'index officiel (voir § 7).

**Agent ou agent profond ?** Un agent LangChain (`create_agent`, ce que le service fait aujourd'hui) est une boucle
modèle ↔ outils avec des middlewares. Un agent profond (`create_deep_agent`) est le **même moteur** préconfiguré avec un
« harnais » : liste de tâches, fichiers virtuels pour délester le contexte, sous-agents isolés (outil `task`), compétences,
mémoire `AGENTS.md`, résumé automatique. Le harnais s'obtient aussi en ajoutant ses middlewares à `create_agent` (E12.0).

| ID | Tâche et fonction officielle | Preuve de terminé | Origine |
|---|---|---|---|
| E12.0 | **Décidée le 2026-10-31 : `create_deep_agent`, réalisé en E2.0.** Reste ici d'activer, une à une, les fonctions du harnais déjà présent (sous-agents, fichiers, compétences, mémoire, rubrique) selon les tâches ci-dessous | Voir E2.0 | J5–J7 |
| E12.1 | `SubAgentMiddleware` (outil `task`) : sous-agents par domaine (Paie, Employés, Chantiers, Heures supplémentaires, Audit) avec instructions, outils, modèle et budget propres ; **isolation du contexte** ; `tools` d'un sous-agent **remplace** ceux du parent (droits minimaux) ; `response_format` pour des résultats structurés ; mode `fork` (bêta, `deepagents>=0.7.13`) à part | Aucune élévation de droits, latence et coût mesurés | J5, P3 « conditionnel » |
| E12.2 | Sous-agents asynchrones (lancer, vérifier, modifier, annuler) pour les analyses longues ; flux par sous-agent (`stream.subagents`) ; **exige un serveur « Agent Protocol »** : le service FastAPI actuel n'en est pas un, et la voie officielle documentée est le serveur LangGraph (`langgraph dev` en local ; déploiement géré exclu, Q3) ; voie gratuite à instruire (Q10) | Analyse longue en parallèle, annulable | Copilot future |
| E12.3 | Fichiers virtuels pour délester le contexte : `FilesystemMiddleware`, `StateBackend`, `StoreBackend` (**fournir une fabrique d'espaces de noms par utilisateur** : par défaut l'espace est celui de l'assistant, donc partagé), `CompositeBackend` ; **jamais** `FilesystemBackend` ni `LocalShellBackend` sur un serveur ; règles `permissions` (première règle gagnante, non applicables aux bacs à sable) | Gros résultats délestés, isolation par utilisateur testée | Copilot future |
| E12.4 | Compétences chargées à la demande (`SKILL.md`, norme Agent Skills) : source, version, périmètre et revue par compétence ; ne remplacent ni RBAC ni politique système ; décision (Q13, 2026-10-31) : **contenu séparé** — les `SKILL.md` du dépôt restent pour les développeurs, l'agent a ses propres compétences d'exécution, écrites pour lui | Compétence chargée progressivement, testée | Copilot future |
| E12.5 | Mémoire `AGENTS.md` (toujours chargée, modifiable par l'agent) : **risque d'injection si partagée** ; limiter à l'espace utilisateur, écriture contrôlée | Politique écrite, test d'injection | Copilot future, production |
| E12.6 | `RubricMiddleware` (bêta, `deepagents>=0.6.5`) : auto-évaluation par grille sur les rapports et analyses (J5) | Grille et seuil évalués sur le jeu | J5 |
| E12.7 | Exécution : interpréteur `eval` (QuickJS, **sans shell, réseau ni fichiers**) en premier pour les calculs ponctuels ; `ShellToolMiddleware` avec `DockerExecutionPolicy` seulement dans un conteneur jetable **sans réseau, sans secret, sans accès à l'ERP** ; `HostExecutionPolicy` interdite ; fournisseurs de bacs à sable hébergés exclus (Q3) | **QuickJS autorisé (Q7, 2026-10-31) ; le conteneur jetable est autorisé en principe et exige une décision de sécurité écrite avant son premier usage** | M6 |
| E12.8 | Recherche de fichiers : `FilesystemFileSearchMiddleware` (`root_path`, ripgrep) sur des documents RH locaux, racine en lecture seule, sans secrets | Périmètre étroit testé | M5 |
| E12.9 | Contrôle de la paie (J5) : contrôles déterministes d'abord (règles approuvées), puis détection de données atypiques ; « atypique » n'est pas « erroné » ; aucun salaire modifié automatiquement | Règles approuvées, faux positifs mesurés | J5, innovations P2 |
| E12.10 | Profils de harnais, page des modèles, protocole ACP, intégration AG-UI de Deep Agents (todos, état des sous-agents) | Décision par élément | Copilot future |
| E12.11 | Autres motifs multi-agents de LangChain (sous-agents, transferts, compétences, routeur, flux personnalisé), mode de point de reprise des sous-graphes (hérité, par appel, par thread) et choix entre API de graphe et API fonctionnelle de LangGraph : ne retenir que ce qui apporte un gain mesuré | Comparatif | Analyse « multi-agents » |

### E13 — Pilote réel, exploitation et extensions

| ID | Tâche | Preuve de terminé | Origine |
|---|---|---|---|
| E13.1 | Démonstration J1 sur la base actuelle : images reconstruites, banc réel, flux réels | Démonstration présentée | T20 |
| E13.2 | Modèle local (T3.1) : licence, provenance des poids, matériel limité ; pseudonymisation tant qu'un modèle sort de l'infrastructure ; décision du propriétaire sur le modèle (Q5) | Modèle évalué sur le jeu de référence | T3.1 |
| E13.3 | Langues arabe et darija (T3.9) : jeu Darija en alphabet arabe **et** Arabizi ; **LIDstral Arabic reste « à évaluer avant toute adoption »** (confirmé le 2026-10-31) ; veille mensuelle des modèles déjà en place | Jeu Darija et rapport d'évaluation | T3.9, § 4.1 |
| E13.4 | Objectifs de service (T3.5) : p50 et p95 par type de question, profils de **charge de 1, 5 et 20 exécutions simultanées**, corpus croissants, client lent, fournisseur indisponible, base saturée ; seuils : **p95 ≤ 30 s**, jeu de 200 cas (Q8) | Rapport de charge et de panne | T3.5, analyse « latence » |
| E13.5 | Retours et évaluation continue (T3.8) : pouce haut/bas, relecture d'échantillons, évaluation hors ligne en CI | Boucle de retour active | T3.8 |
| E13.6 | **Pilote réel (J3, T3.10)** : utilisateur et périmètre choisis, données réelles seulement après E5 et E6, retours consignés | Pilote clos avec bilan | J3, T3.10 |
| E13.7 | Autres départements et A2A (J8) : mêmes portes que J1 à J3 par département ; A2A seulement pour une application tierce réelle | Un département pilote | J8 |
| E13.8 | Terrain et voix (J9) : mobile chef de chantier, voix ; PWA hors ligne pour un futur Pointage (ADR métier d'abord) ; MQTT pour des capteurs ; QUIC/HTTP3 au niveau infrastructure ; **WebSocket** pour la voix continue ; chacune avec son déclencheur mesuré | ADR ou décision de non-adoption par élément | J9, innovations P3 |
| E13.9 | Travailleurs distants OCR, inférence ou analytique par gRPC (comparé à HTTP) ; justificatifs scannés par OCR isolé | Besoin mesuré, comparatif | Innovations P2 |
| E13.9 | **Second filet de confidentialité, reporté à la demande du propriétaire (2026-10-31)** : évaluer `PIIMiddleware` (`strategy` `block`, `redact`, `mask`, `hash` ; `apply_to_input`, `apply_to_output`, `apply_to_tool_results`) avec détecteurs personnalisés CIN, RIB/IBAN, téléphone, à comparer au masquage de la passerelle (Presidio, écarté sur données réelles) et à celui d'OpenInference, sans double transformation | Décision écrite après mesure sur cas synthétiques | M2, E5.1 |

### E14 — IA interne : vLLM et sortie de LiteLLM (dernière épopée)

Objectif du propriétaire (2026-10-31) : une IA **interne**, donc des modèles servis dans l'entreprise. **Limite consignée** :
LiteLLM 1.106.6 exige `openai<3.0.0`, ce qui retient `openai` en 2.x (§ 3) ; la montée en 3.x se fait ici, une fois LiteLLM
abandonné : **dès que le premier modèle interne tient le jeu de référence** (décision du 2026-10-31, Q18). Les exigences de `conventions/agents-ia.md` (« Modèles auto-hébergés ») s'appliquent : licence et provenance des
poids, conteneur sans réseau sortant, ressources mesurées, achat de matériel = décision du propriétaire.

| ID | Tâche | Preuve de terminé | Origine |
|---|---|---|---|
| E14.R | Relecture d'entrée (§ 4.0) | Pages lues consignées | Décision 2026-10-31 |
| E14.1 | Choix et évaluation des modèles servis par vLLM sur le jeu de référence (justesse, outils, JSON, raisonnement, arabe et darija) ; inventaire du matériel disponible (inconnu à ce jour, Q18) puis matériel nécessaire chiffré | Rapport comparatif signé | E13.2, T3.1 |
| E14.2 | Service vLLM (serveur compatible OpenAI) dans `docker-compose.yml`, sans réseau sortant, ressources fixées | `docker compose up -d` suffit | Règle du `docker compose` unique |
| E14.3 | Remplacer LiteLLM : ce qu'il apporte aujourd'hui (routage et repli entre fournisseurs gratuits, budgets par utilisateur, garde-fou de contenu, transmission de `reasoning_content`, journaux de dépense) est à rattacher à un composant officiel de remplacement ou à abandonner ; lire la documentation de `langchain-openai` / vLLM avant de choisir | Chaque fonction a un remplaçant ou une décision d'abandon écrite | E7.6, E6.4, E5.6 |
| E14.4 | Passer `openai` en 3.x et retirer la borne de `litellm`, tests et jeu de référence verts | Verrous à jour | § 3 |

## 5. Traçabilité : où est passé chaque ancien élément

*Renumérotation du 2026-10-31 : les identifiants ci-dessous sont les nouveaux (voir l'introduction du § 4 pour la correspondance avec les brouillons du jour).*

| Ancien élément | Source | Devenu |
|---|---|---|
| P0.1–P0.4, G1 (MCP, identité) | `plan-integration.md` | **Fait** (serveur MCP Spring AI, jeton RS256) ; échange RFC 8693 → E7.3 |
| P1.1–P1.6 | idem | **Fait** (30 outils lecture, audit MCP, RBAC) sauf T26/E7.3 et E6 |
| P2.1–P2.6, G2 (LangGraph.js, checkpoints) | idem | **Remplacé** : service Python (décision du 2026-10-24) ; checkpoints PostgreSQL **faits** ; durabilité fine → E2.8 ; interruptions → E10.3 |
| P3.1–P3.3, P3.6, P3.7, G3 | idem | **Fait** (CopilotKit Angular, A2UI) |
| P3.4 reconnexion | idem | E8.4 |
| P3.5 accessibilité | idem | E9.13 |
| P3.8 interface ouverte | idem | E9.9 |
| P4.1–P4.7, G4 (RAG) | idem, `rag.md` | E11.1 à E11.7 |
| D1–D8 | ADR 0013 | D1 (pilote), D2 (identité), D3 (MCP), D4 (CopilotKit), D5 (persistance), D7 (LiteLLM) **décidées de fait** ; D6 (migrations du checkpointer : `setup()` automatique au démarrage, contraire à la mise en garde de l'époque) → **à confirmer** (Q14) ; D8 : A2UI **fait**, Rive → E9.14, interface ouverte → E9.9 |
| Modes M0–M4 par domaine | `progression-ui.md` | M0 à M3 **faits en partie** ; déploiement par domaine → E9.15 ; M4 → E9.9 |
| Les neuf piliers | `analyse-architecture.md` | Latence → E2.9, E13.4 ; identité → E6, E7.3 ; hallucinations → E2.1, E2.7, E1.3 ; multi-agents → E12 ; MCP → fait ; AG-UI → E8.4, E9 ; mémoire → E8 ; compactage → E2.3 ; checkpoints → E10.4 |
| Tâches PDF asynchrones, corrélation d'audit, profils de charge | idem | E10.5, E5.3, E13.4 |
| Matrice des protocoles (gRPC, A2A, WebSocket, MQTT, QUIC, outbox) | `protocoles-et-innovations.md` | E13.7 à E13.9, E10.5 |
| Matrice des besoins (RAG, rejet d'import, quasi-doublons, KPI sémantiques, atypiques, OCR, PWA, RLS, mesure) | idem | E11.9, E11.10, E12.9, E13.9, E13.8, E11.4, E1.3 ; **catalogue de KPI** : **fait** par les outils (`definitions`, `paie_comparer`) |
| ADR 0002 (AG-UI, A2UI, Rive, annulation par `runId`) | supprimé le 2026-10-24 | AG-UI et A2UI **faits** ; Rive → E9.14 ; annulation par `runId` → à tester en E9.13 |
| ADR 0008 (LiteLLM, cache, superviseur, mémoire à trois niveaux, A2A, GraphRAG, Langfuse, interrupteur) | supprimé le 2026-10-24 | LiteLLM **fait** ; cache cloisonné → vérifier en E5.6 ; superviseur → E12.1 ; mémoire → E8 ; A2A → E13.7 ; GraphRAG → E11.7 ; Langfuse remplacé par **Phoenix** ; interrupteur → E5.5 |
| T1–T8, T11–T17, T22 | `docs/ia.md` | **Faits** |
| T9, T20 | idem | E13.1 |
| T10 (qualification) | idem | E1.3 |
| T18 | idem | E5.2, E5.3 |
| T19 | idem | **Fait** côté service ; reprise du fil dans l'interface → E1.6, E8.1 |
| T21, T23–T31 | idem | E7.10, E7.9, E7.1 à E7.8 |
| T2.1–T2.9 | idem | E6 (T2.7 : annulée, il reste l'affichage → E6.6) |
| T3.1–T3.10 | idem | E13.2, E8.1, E8.2, E5.3, E13.4, E5.4, E5.5, E13.5, E13.3, E13.6 |
| J2 à J9 | idem | E6, E13.6, E9.5, E12.9, E10.6, E11.8, E13.7, E13.8 |
| V1a, V1d, V1f | plan de clôture | **Faits** |
| V1b, V1c, V1e | idem | E1.6 + E8.1, E1.3, E1.4 |
| M1 à M6 | idem | E2.1 à E2.5 et E2.3 (M1, M3), E5.1 (M2), E10.2 (M4), E12.8 (M5), E12.7 (M6) |
| Fonctions de `copilot-kit-future-to-implement.md` (supprimé) | Codex, 2026-10-31 | E9 (CopilotKit), E2 et E8 (LangChain), E2, E8 et E10 (LangGraph), E12 (Deep Agents) |
| Écarts de `backend-gap-analysis.md` (supprimé) | Codex, 2026-10-31 | E2.1 à E2.3, E2.7, E2.8, E5.1 à E5.2, E8.3, E10, E12 |
| Fonctions exigeant un service payant ou hébergé | tous | Section « Fonctions exclues définitivement » (§ 1) |
| Demandes du 2026-10-31 (rôles, départements, hiérarchie, champs ; migration FastAPI) | propriétaire | E4, E3 |

Les documents supprimés se relisent avec `git show 46cf1e39^:<chemin>` (par exemple `docs/ia/plan-integration.md`,
`docs/ia/rag.md`, `docs/ia/progression-ui.md`, `docs/ia/protocoles-et-innovations.md`,
`docs/ia/analyse-architecture.md`, `docs/handoff/integration-ia.md`, ADR 0002, 0008 et 0013).

## 6. Décisions du propriétaire (toutes les questions sont closes au 2026-10-31)

| Q | Décision |
|---|---|
| Q1 | Ce plan est la référence ; les deux plans de Codex sont supprimés. |
| Q2 | Ordre validé : le numéro des épopées est l'ordre de travail (§ 4). |
| Q3 | Services payants ou hébergés **exclus définitivement** (§ 1, « Fonctions exclues »). |
| Q4 | **Aucune écriture** pour l'instant : l'assistant reste en lecture seule jusqu'après le pilote réel ; E10 reste préparée et inactive. |
| Q5 | Masquage **uniquement sous contrôle du backend** (E4) ; `PIIMiddleware` reporté en E13.9 ; données RH réelles **autorisées** vers les modèles externes de la passerelle, le backend décidant de ce qui sort ; mémoire longue = **préférences et faits métier**, avec consentement, consultation, correction, oubli, expiration (E8.3). |
| Q6 | État partagé : **filtres de vue pilotés par l'agent**, ajustables par l'utilisateur (E9.4). |
| Q7 | Interface générative ouverte **autorisée** (E9.9, `conventions/agent-ui.md`) ; MCP Apps abandonné ; WebMCP non adopté pour l'instant ; exécution de code : **QuickJS, puis conteneur Docker jetable** (E12.7). |
| Q8 | Latence **p95 ≤ 30 s** ; jeu de référence d'environ **200 cas** ; retard de version toléré **30 jours** ; conservation des conversations et traces **90 jours** ; **aucun plafond** appliqué par nous (E2.9). |
| Q9 | Jeu adverse avec **PyRIT** (Microsoft), documentation lue avant adoption, complété par des cas propres à l'ERP (E6.5). |
| Q10 | Liste des conversations par une **table de fils tenue par l'ERP** (E7.10). |
| Q11 | Pièces jointes **plus tard, cadrées** (E9.7) ; voix **en fin de parcours** (E13.8). |
| Q12 | **Tous** les corpus (aide métier de l'ERP, textes réglementaires, procédures internes) ; **tout le RAG est isolé dans E11**. |
| Q13 | Compétences : **contenu séparé** (les `SKILL.md` du dépôt restent pour les développeurs ; l'agent a les siennes, E12.4). |
| Q14 | Tables du point de reprise : **`setup()` officiel de LangGraph** au démarrage (E2.8). |
| Q15 | Migration vers FastAPI : **tout le backend, domaine par domaine**, transversal d'abord puis métier un par un ; ordre métier `function`, `equipe`, `chantier`, `employee`, `heuresupp`, `paie` ; motif : **outils IA natifs Python** (E3). |
| Q16 | Serveurs de documentation pour les assistants de développement : **CopilotKit** (avec ses compétences), **LangChain** (docs et référence), **Angular CLI** ; Context7 pour le reste (E1.7). |
| Q17 | Contrôle d'accès par **RBAC, permissions et droits par champ** ; départements et hiérarchie = **information** seulement ; champs sensibles : **rémunération, identité, banque et social, contact** (E4). |
| Q18 | Matériel de modèles internes **inconnu** : inventaire d'abord ; LiteLLM abandonné **dès que le premier modèle interne tient le jeu de référence** (E14). |
| Q19 | Dependabot activé pour les composants IA ; ses PR lancent la CI. |
| Q20 | Ticket CopilotKit (E1.8) et essai isolé de `@a2ui/angular` (E1.9, fait) ; protocole **v0.9 adopté, v1.0 quand stable**. |
| Q21 | **AG Grid Community** pour les tableaux et **`ng2-charts`** pour les graphiques, **dans toute l'application** (E7.11). |

## 7. Sources officielles

Lues pour ce plan (2026-10-31) : LangChain [middlewares préconstruits](https://docs.langchain.com/oss/python/langchain/middleware/built-in),
[MCP](https://docs.langchain.com/oss/python/langchain/mcp), [tests et évaluations](https://docs.langchain.com/oss/python/langchain/test/evals),
[join/rejoin](https://docs.langchain.com/oss/python/langchain/frontend/join-rejoin) ; LangGraph
[vue d'ensemble](https://docs.langchain.com/oss/python/langgraph/overview), [persistance](https://docs.langchain.com/oss/python/langgraph/persistence),
[interruptions](https://docs.langchain.com/oss/python/langgraph/interrupts), [mémoire](https://docs.langchain.com/oss/python/langgraph/add-memory),
[streaming](https://docs.langchain.com/oss/python/langgraph/streaming) ; Deep Agents
[vue d'ensemble](https://docs.langchain.com/oss/python/deepagents/overview), [sous-agents](https://docs.langchain.com/oss/python/deepagents/subagents),
[backends](https://docs.langchain.com/oss/python/deepagents/backends), [production](https://docs.langchain.com/oss/python/deepagents/going-to-production),
[AG-UI](https://docs.langchain.com/oss/python/deepagents/ag-ui) ; CopilotKit [Angular](https://docs.copilotkit.ai/angular),
[référence](https://docs.copilotkit.ai/reference/angular), [exemples](https://docs.copilotkit.ai/angular/features),
[WebMCP](https://docs.copilotkit.ai/angular/webmcp), [AG-UI Streams](https://docs.copilotkit.ai/AG-UI-Streams),
[choix des primitives](https://docs.copilotkit.ai/concepts/which-hook) ; registres PyPI et npm pour les versions.

**Lues pour la version du 2026-10-31 (suite)** : LangChain, LangGraph et Deep Agents, toutes les pages de l'index officiel
(runtime, sortie structurée, garde-fous, mémoire à long terme, multi-agents, tolérance aux pannes, exécution durable,
checkpointers, stores, retour dans le temps, sous-graphes, API fonctionnelle, agents asynchrones, compétences, mémoire,
interpréteurs, bacs à sable, permissions, profils, grilles d'évaluation, ACP). CopilotKit :
[outils frontend et interface générative](https://docs.copilotkit.ai/angular/guides/frontend-tools-generative-ui),
[fils, mémoire, pièces jointes, interface sans chat](https://docs.copilotkit.ai/angular/guides/threads-memory-attachments-headless),
[interactions humaines](https://docs.copilotkit.ai/angular/guides/human-in-the-loop), [état partagé](https://docs.copilotkit.ai/angular/guides/shared-state),
[interface de chat](https://docs.copilotkit.ai/angular/guides/chat-ui), [dépannage](https://docs.copilotkit.ai/angular/guides/troubleshooting),
[production et cycle de vie](https://docs.copilotkit.ai/reference/angular/production-lifecycle), [runtime](https://docs.copilotkit.ai/angular/backend/copilot-runtime),
[déploiement du runtime](https://docs.copilotkit.ai/runtime-server-adapter), [authentification](https://docs.copilotkit.ai/auth),
[agent AG-UI maison](https://docs.copilotkit.ai/backend/custom-ag-ui-agent), [agents autogérés](https://docs.copilotkit.ai/backend/self-managed-agents),
[agent personnalisé](https://docs.copilotkit.ai/backend/custom-agent), [inspecteur](https://docs.copilotkit.ai/angular/inspector),
[choix du modèle](https://docs.copilotkit.ai/angular/model-selection), [architecture](https://docs.copilotkit.ai/angular/concepts/architecture),
[construire avec des agents](https://docs.copilotkit.ai/angular/build-with-agents), [AG-UI](https://docs.copilotkit.ai/agentic-protocols/ag-ui),
[frameworks communautaires](https://docs.copilotkit.ai/angular/community-frameworks), Intelligence
([vue d'ensemble](https://docs.copilotkit.ai/intelligence/overview), [démarrage](https://docs.copilotkit.ai/intelligence/quickstart),
[mémoires](https://docs.copilotkit.ai/intelligence/memories), [analyses](https://docs.copilotkit.ai/intelligence/analytics),
[canaux](https://docs.copilotkit.ai/intelligence/channels), [trajectoires](https://docs.copilotkit.ai/intelligence/trajectories),
[collecteur autonome](https://docs.copilotkit.ai/intelligence/standalone-collector)) et la page des prix.

**Adresses introuvables (HTTP 404) à la date de lecture, donc non lues** : `/angular/guides/authentication`,
`/angular/multi-agent`, `/angular/sub-agents`, `/intelligence/learning`, ainsi que les anciens noms de guides
(`guides/tools`, `guides/interrupts`, `guides/threads`, `guides/attachments`). Les index ne les listent pas ; leur contenu
utile (authentification, apprentissage) est couvert par les pages ci-dessus. **Limites connues de la lecture** : la page
AG-UI de CopilotKit ne détaille pas le catalogue d'événements (renvoi vers ag-ui.com, à lire avant E8.4 et E9.5) et les
pages « Common Copilot issues », « Runtime debug mode » et « AG-UI Event Inspector » sont seulement citées par le dépannage.

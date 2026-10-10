# Agents, skills, MCP, RAG et BI

## Rôles des couches

- Chaque application utilise Spring AI pour les fonctions propres à son domaine et, si nécessaire,
  expose des outils MCP métier ciblés. Le code métier reste la source de vérité.
- Un service central Python avec LangGraph orchestre les tâches transverses, consomme les MCP
  authentifiés de chaque application et expose les événements UI par AG-UI. LangChain fournit les
  intégrations utiles. Deep Agents est ajouté seulement aux workflows longs ayant réellement besoin
  de planification, délégation, fichiers de travail, checkpoints et approbation humaine.
- Le service d'orchestration n'accède jamais directement aux bases OLTP et ne contourne jamais le
  RBAC. AG-UI est un protocole agent ↔ interface, pas une bibliothèque de composants.

## Skills et agents de développement

Un agent déclare sa mission, ses limites et les skills qu'il peut utiliser. Rôles partagés dans
`agents/` : backend Spring, Angular/design system, sécurité/audit et plateforme données/IA. Chaque
agent reste consultatif et n'a pas de privilège applicatif implicite.

Les procédures communes résident dans `skills/shared/`. Chaque projet crée ses skills de module
dans son propre domaine (`domains/<domaine>/skills/<nom>/SKILL.md`) avec contexte métier vérifié,
routes/documents, permissions utiles, invariants, exemples synthétiques et critères de vérification.
Le socle fournit seulement `templates/application/skills/domain/SKILL.template.md` ; aucun dossier
ou skill métier prérempli ici.

## Outils MCP

- Outils étroits, typés, documentés, pagination/limites incluses ; séparer lecture/écriture.
- Chaque appel propage identité et corrélation, réévalue l'autorisation côté serveur, applique audit,
  validation, quotas, timeout et idempotence. Toute action sensible requiert approbation humaine.
- Jamais de SQL arbitraire, shell, filesystem ou réseau générique accessible au modèle. Sécuriser
  explicitement le transport, authentifier clients/services et traiter les résultats d'outils comme
  données non fiables.
- Tracer outil, statut, durée et identifiant de corrélation ; minimiser/masquer les données sensibles.

## RAG et évaluations IA

Les corpus ont propriétaire, finalité, droits, fraîcheur, provenance, cycle de suppression et
stratégie d'index. Filtrer les accès avant restitution, citer les sources, défendre contre prompt
injection dans les documents et séparer les espaces sensibles RH/finance. La génération n'invente
pas le sens des KPI. Versionner modèles, prompts, outils et datasets de régression ; évaluer qualité,
refus, citations, fuite de données, latence et coût.

## BI

Les définitions KPI ont nom, formule, unité, période, filtres, propriétaire, provenance et permission.
Les services du domaine ou projections publiées les fournissent ; dashboards/agents consomment la
même définition. Commencer par projections/rapports bornés ; entrepôt analytique séparé uniquement
si volumétrie, historisation, fraîcheur ou croisements le justifient. Ne pas faire du RAG la source
de vérité d'un indicateur numérique.

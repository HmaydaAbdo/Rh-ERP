# Handoff — audit exhaustif de conformité ERP-RH

## Objectif

Vérifier le projet entier contre les conventions de référence et produire une conformité démontrée
par des contrôles, une matrice de couverture et des corrections synchronisées. Périmètre : backend,
frontend, tests, Docker Compose/images/proxy, CI et exploitation, sécurité, RBAC, audit, données,
logs, métriques, performance, BI et capacités IA/AG-UI/A2UI.

## Sources normatives

Lire `AGENTS.md`, `CLAUDE.md`, puis toutes les conventions indexées à la racine dans
`conventions/`. La documentation `docs/` décrit l'application, ses domaines, ses permissions et ses
écarts connus. Une convention est une exigence ; `TODO.md`, les anciens rapports et les assertions de
tests sont des indices à revalider contre le code courant, pas des preuves suffisantes à eux seuls.

## Méthode

1. Établir une matrice `convention → exigence → fichiers/contrôle → preuve → statut → action` pour
   toutes les conventions, sans limiter la revue au backend.
2. Lire les consignes locales et la documentation du domaine avant d'inspecter ou modifier ses
   fichiers. Examiner les manifests, code, schéma/migrations, tests, Compose, Dockerfiles, Nginx,
   workflows, configuration et scripts d'exploitation.
3. Pour chaque écart, distinguer : correction compatible avec les décisions déjà prises ; choix
   métier/permission nécessitant le propriétaire ; décision d'architecture nécessitant une
   proposition et validation ; exception documentée avec preuve et risque accepté.
4. Corriger les écarts autorisés en lots cohérents. Synchroniser tests, documentation de domaine,
   RBAC, modèle de données, TODO et ADR lorsque concernés.
5. Exécuter les contrôles de compilation, tests et vérification réellement requis, en privilégiant
   des environnements isolés. Aucune affirmation de conformité sans preuve reproductible.
6. Publier un rapport concis avec couverture, preuves, corrections, dérogations et décisions
   encore attendues. La conformité totale n'est atteinte que lorsque les écarts critiques sont
   corrigés ou explicitement décidés et documentés.

## Garde-fous

- Ne pas inventer de règle métier, supprimer de données ni modifier la production.
- Ne pas affaiblir les conventions de sécurité, audit, confidentialité ou propriété des données.
- Ne pas modifier les choix d'architecture importants sans validation explicite.
- Garder les fichiers utilisateur préexistants hors des commits lorsqu'ils ne font pas partie de la
  tâche ; relire le contenu staged avant chaque commit.
- Le dossier `conventions/staport/` et `STAPORT_STANDARDS_VERSION` ont été supprimés ; ne pas les
  recréer. `conventions/` à la racine est la source normative.

## Premier passage

Commencer par vérifier la liste réelle des conventions et l'état Git, puis lire `TODO.md`,
`docs/conformite/matrice.md`, `docs/architecture.md`, `docs/deployment.md` et `docs/testing.md`.
Confirmer les écarts contre le dépôt actuel avant de reprendre les points anciens. Examiner les
parcours d'authentification/RBAC et audit, les domaines métier, les écrans/tests frontend, la
configuration et les services Docker/CI. Produire la matrice avant d'entreprendre un refactoring
large.

## Passe active du 2026-10-11

La matrice [`docs/conformite/matrice.md`](../conformite/matrice.md) est l'unique registre des statuts
et preuves de conformité. Les opérations d'exploitation sont suivies dans `TODO.md`.
La décision CORS a été validée : les origines sont désormais explicites par environnement et
documentées dans l'[ADR 0003](../adr/0003-cors-origines-explicites.md). Les contrôles Maven et
Angular restent à rejouer dans une session où leurs verrous/outils sont disponibles ; la bascule
PG17→PG18, pgAudit de production et la sauvegarde hors hôte restent des contrôles d'exploitation.

## Critères de sortie

- Chaque exigence applicable a une preuve ou une dérogation explicitement approuvée.
- Aucun écart critique de sécurité, d'intégrité des données, d'audit ou de permissions ne reste
  implicite.
- Les tests et contrôles prévus par les conventions passent, et les limites/non-exécutions sont
  rapportées précisément.
- Le rapport, la documentation de projet, les tests et les conventions sont cohérents.
- Les modifications validées sont commitées et poussées ; le dépôt est propre.

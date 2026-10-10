# Handoff — conformité Staport ERP-RH

Mis à jour le 10 octobre 2026. Ce document est la reprise détaillée du chantier; il doit être maintenu à chaque étape et rester franc sur les écarts ouverts.

## Objectif complet

Amener ERP-RH à **100 % de conformité** avec les nouvelles conventions Staport versionnées et réutilisables par les projets actuels et futurs. Le résultat comprend le code, les conventions, les skills d'agents par domaine, la documentation, la CI et les validations. Aucun objectif n'est considéré terminé si un écart applicable reste ouvert sans décision explicite.

Le périmètre convenu couvre notamment :

- backend Spring/JDK supporté, architecture par domaine, sécurité, RBAC par domaine et audit;
- PostgreSQL 18 avec pgvector et migrations Flyway;
- Angular stable actuel, pratiques standalone, Signal, zoneless, lazy loading, formulaires typés, UI/UX Staport, accessibilité, performance et sécurité;
- tests unitaires, composants, intégration, contrat, E2E et validations non fonctionnelles appropriées;
- BI et IA progressivement, Spring AI dans chaque application, services d'orchestration LangGraph/MCP/skills/RAG séparés et protégés, avec autorisations/audit par domaine;
- procédure sûre de migration des données de production PostgreSQL 17 vers 18;
- synchronisation de toutes les conventions et documents. Le squelette commun `domains/` reste volontairement vide; les skills métier résident dans l'application correspondante.

## Travail effectué

### Standards et documentation

- Créé le dépôt de référence Staport et versionné le snapshot `v0.1.1`; ERP-RH épingle ce snapshot dans `conventions/staport/` et `STAPORT_STANDARDS_VERSION`.
- Ajouté l'ADR d'adoption, la proposition plateforme BI/IA, les skills d'agents des domaines ERP-RH, et les liens dans les index/AGENTS/CLAUDE.
- Révisé les conventions frontend pour Angular 22.2.2, Signals, OnPush, zoneless, standalone, workflow de mise à jour, Angular Aria/CDK, Tailwind et Lucide. PrimeNG est exclu du socle selon le dernier choix explicite de l'utilisateur; les règles et docs historiques sont encore à synchroniser.

### Backend et base

- Porté la cible Java du backend à Java 21.
- Démarré localement PostgreSQL 18.6 avec pgvector 0.8.7 et migrations Flyway jusqu'à V15.
- Migré une copie locale logique depuis PostgreSQL 17 vers un nouveau volume PostgreSQL 18; comparé les nombres de lignes des 28 tables publiques.
- Les tests backend passés dans JDK 21 / PostgreSQL 18 : **261 tests, 0 échec, 0 erreur, 0 ignoré**.
- Le volume de données PG17 `erp-rh_postgres_data` est conservé comme rollback local; le service Docker local est sur `erp-rh_postgres_data_v18`.
- Ajouté le runbook de migration de production dans `docs/deployment.md`. La production reste en PG17 et n'a pas été touchée. Un déploiement direct avec le nouveau Compose créerait un nouveau volume vide; faire backup, répétition, fenêtre de maintenance, restauration logique, contrôles, bascule et plan rollback. Si la PG18 accepte des écritures, les réconcilier avant retour à PG17.

### Frontend

- Migré Angular de la version 17 à **22.2.2** avec les migrations CLI une majeure à la fois.
- Plié Node dans CI, `frontend/.nvmrc` et `engines` à **24.15.0**.
- Build Angular 22.2.2 réussi sur Node 24.15; dernière suite frontend passée : **175/175**, Chrome Headless 154. Elle comprend les tests du login/récupération de mot de passe et 6 tests des notifications/dialogues partagés.
- Remplacé le feedback PrimeNG global et par domaine par `NotificationService` / `ConfirmDialogService`, un viewport Signals et un dialogue `role="alertdialog"` basé sur CDK A11y (fermeture accessible, annonce des erreurs, piège de focus, Échap). Le guard de formulaire non enregistré et l'intercepteur HTTP utilisent les services partagés. Les `<p-confirmDialog>` et leurs providers locaux sont retirés; les services ne changent pas les règles métier.
- Le shell global est passé de PrimeIcons à Lucide (menu, navigation, thème, déconnexion); ses tooltips utilisent le titre natif accessible.
- Le build de production donne **780,30 kB** d'entrée et reste sous le seuil d'avertissement de 800 kB; le SCSS du wizard d'export de paie reste à 15,60 kB, soit 7,60 kB au-dessus de son avertissement. La suite complète avait passé **175/175** avant le dernier remplacement d'icônes; la suite après ce dernier changement est en cours avant push. Karma reste déprécié et les écrans PrimeNG produisent encore des avertissements `NG01354` / `NG0956`.
- La migration générée a modifié les composants et ajouté `ChangeDetectionStrategy.Eager` pour préserver les comportements de détection historiques. `provideZoneChangeDetection()` a été retiré; Angular utilise désormais son défaut zoneless, mais Zone.js reste dans les polyfills/runtime et les composants Eager doivent être examinés. Les tests émettent encore l'avertissement Karma déprécié et `NG01354` répété par des contrôles PrimeNG.
- PrimeNG 17 reste actuellement dans l'arbre de dépendances et ses peer dependencies ne supportent pas Angular 22. PrimeFlex n'était déjà pas une dépendance installée; PrimeIcons 8 est toujours déclaré. Les dépendances cibles Angular Aria/CDK, Tailwind 4, Lucide Angular et AG Grid Community sont présentes mais pas encore intégrées aux écrans.

## État et risques ouverts

1. **PrimeNG / licence** : l'utilisateur a choisi explicitement Angular Aria + CDK comme base accessible sans licence commerciale et a écarté PrimeNG 22. Ne pas ajouter PrimeNG ni activer une licence PrimeNG.
2. **Dépendances incompatibles** : le lockfile et `package.json` déclarent encore PrimeNG 17 / PrimeIcons 8 avec Angular 22 et Zone.js 0.15; l'installation a été forcée. Ne pas masquer les pairs avec `--force` ou `legacy-peer-deps`. Migrer les usages vers HTML/Angular Aria/CDK, puis supprimer PrimeNG, PrimeIcons, Zone.js et CSS/thème obsolètes afin que `npm ci` fonctionne proprement.
3. **Migration UI incomplète** : 29 fichiers TypeScript importent encore PrimeNG et 112 occurrences PrimeIcons subsistent dans les sources applicatives. Le thème généré est PrimeNG 17. Le sélecteur différé, les tableaux et formulaires, menus, calendrier, graphiques, tooltips, icônes et styles doivent être migrés vers les composants Staport basés sur Angular Aria/CDK, Tailwind et Lucide, puis contrôlés visuellement.
4. **Zoneless/Signals** : `main.ts` n'ajoute plus `provideZoneChangeDetection()`; Angular 22 tourne en mode zoneless par défaut. `angular.json` charge encore Zone.js, plusieurs tests utilisent `fakeAsync`, et les composants migrés marqués Eager doivent être convertis en OnPush/Signals/AsyncPipe et testés sous interactions réelles.
5. **Runner / build / performance** : la suite utilise Karma (builder déprécié; migration vers Vitest à faire). Le dernier build réussit avec 780,30 kB initiaux, sous l'avertissement de 800 kB; `paie-export-wizard.scss` fait 15,60 kB, 7,60 kB au-dessus de l'avertissement de 8 kB. Migrer les tests selon leurs APIs, puis optimiser le CSS sans relever les seuils.
6. **Sécurité dépendances** : `npm audit` a signalé 19 vulnérabilités de sévérité élevée lors de l'installation. Audit détaillé et mises à jour ciblées restent à faire; ne pas lancer `npm audit fix --force` à l'aveugle.
7. **E2E/non fonctionnel** : aucun pipeline Playwright/browser E2E n'est encore ajouté. Définir les parcours critiques (auth, permissions, paie, exports), accessibilité automatisée, budgets et smoke test, puis couvrir selon leur risque.
8. **Conventions/docs** : les docs projet contiennent encore des références PrimeNG 17, p-chart, PrimeIcons et génération de thème PrimeNG. Les conventions locales ont été orientées vers Angular Aria/CDK et AG Grid réservé aux grilles avancées; les docs et le code restent à migrer. Le snapshot de standard v0.1.1 est immuable; toute correction doit être versionnée dans une nouvelle version canonique et repinnée dans ERP-RH.
9. **Conformité globale à contrôler** : vérifier RBAC par domaine, audit métier, migrations, configuration/secrets, logs/metrics, performance, erreurs, docs de chaque domaine, skills, CI et dead code suivant les conventions de référence. Ne pas déduire conformité totale du seul succès des tests existants.

## Étapes restantes recommandées

1. Migrer les usages PrimeNG restants vers Angular Aria/CDK et composants Staport; le feedback/confirmation partagé et l'intercepteur sont déjà migrés. Supprimer PrimeNG/PrimeIcons/Zone.js/styles/traductions/thème PrimeNG et dead code quand aucun import ou usage ne subsiste.
2. Aligner le lockfile Angular/Node/TypeScript/RxJS/CDK/Aria; exécuter `npm ci` sans options de contournement et résoudre l'audit de vulnérabilités.
3. Retirer Zone.js des polyfills/runtime et moderniser les tests qui utilisent `fakeAsync`; convertir les composants `ChangeDetectionStrategy.Eager` vers OnPush/Signals/AsyncPipe et tester les mises à jour UI.
4. Créer le design system Staport documenté (tokens CSS, Tailwind v4, Angular Aria/CDK, Lucide; variantes, états, focus, reduced-motion, densité, responsive, contraste) et intégrer progressivement les écrans sans comportement métier inventé.
5. Vérifier clavier/lecteur d'écran/localisation et thèmes; réserver AG Grid Community aux grilles avancées mesurées.
6. Optimiser bundle/CSS selon les budgets actuels, configurer un catalogue/test visuel pertinent et ajouter E2E/axe pour parcours prioritaires.
7. Finir audit sécurité dépendances, licences/SBOM, configuration, logs/metrics, data protection, RBAC/audit, performance et revue d'architecture.
8. Aligner index/docs/README de domaine/data-model/RBAC/frontend/deployment/TODO, conventions v suivante, ADR, skills, AGENTS/CLAUDE et CI. Vérifier les liens et supprimer dead code.
9. Rejouer tests backend et frontend, build production, installation `npm ci`, E2E, validation PostgreSQL 18/Flyway, contrôles licences/audit et toute matrice CI. Produire une matrice finale de conformité avec preuve et zéro écart non approuvé.

## Commandes de reprise et validation

À la racine `frontend/`, avec Node 24.15.0 : `npm ci`, `npm test -- --watch=false`, `npm run build`. Backend : exécuter le wrapper Maven du dépôt pour tests et packaging en JDK 21, avec PostgreSQL 18/pgvector disponible. Vérifier le workflow CI et les rapports plutôt que considérer une commande lancée comme une preuve de réussite.

Avant toute migration de production, suivre exclusivement le runbook de `docs/deployment.md`, effectuer une répétition sur sauvegarde représentative, comparer schémas/volumes/références, faire valider la fenêtre de coupure et conserver PG17 intact jusqu'à approbation de restauration complète.

## Reprise Claude — prochain cycle

Le travail est en cours sur `main`. Lire d'abord ce fichier et `AGENTS.md`, puis les conventions dans l'ordre indiqué. Le propriétaire a confirmé la cible Angular stable actuelle du chantier (22.2.2), zoneless, Signals, standalone, lazy loading, Angular Aria/CDK, Tailwind et Lucide. PrimeNG, PrimeIcons et PrimeFlex sont exclus de la cible. Ne pas modifier la production ni supprimer le volume PostgreSQL 17.

Étape immédiate : attendre le résultat de la suite Chrome Headless lancée après le remplacement des icônes du shell; vérifier ensuite `git status` et `git diff --check`, puis pousser le commit sur `origin/main`. Si les tests échouent, corriger et relancer avant le push. Poursuivre la migration frontend en lots cohérents : formulaires/listes/dialogues, sélecteur différé avec Angular Aria, tables et graphiques, tooltips/icônes; enlever les dépendances/styles PrimeNG, supprimer Zone.js, migrer Karma vers Vitest, ajouter E2E/axe, résoudre les avertissements Angular et le budget SCSS, puis valider `npm ci`, build production et toutes les suites. Ne pas annoncer 100 % tant que ces écarts sont encore présents.

### Prompt à copier dans Claude

```text
Continue le chantier ERP-RH directement depuis HANDOFF.md et les changements déjà présents sur main. Mon objectif est d'atteindre une conformité réelle à 100 % avec les conventions Staport versionnées, sans déclarer le travail fini tant qu'il reste des écarts applicables.

Commence par attendre/relire le résultat du test Chrome Headless en cours et vérifier l'état Git. Respecte strictement AGENTS.md : lis les conventions dans l'ordre avant les fichiers du domaine. Angular 22.2.2 est déjà installé; la cible confirmée est standalone, lazy loading, Signals, zoneless, Angular Aria + CDK, Tailwind et Lucide. PrimeNG/PrimeIcons/PrimeFlex sont exclus. Ne remplace pas PrimeNG en masse par du HTML sans comportement accessible et sans tests. Travaille en lots cohérents avec tests et docs dans le même lot.

État constaté dans le handoff : PostgreSQL 18 + pgvector et Java 21 sont déjà configurés localement; 261 tests backend étaient passés; la migration de prod reste PostgreSQL 17 et le volume PG17 doit être conservé. Angular est passé de 17 à 22.2.2, Node 24.15 est épinglé; le build est passé à 780,30 kB d'entrée; 175 tests passaient avant le dernier changement d'icônes et un nouveau run est en cours. Le feedback global (notifications/confirmation) est maintenant basé sur services Signals + CDK A11y; le shell principal utilise Lucide.

Reste à finir : remplacer tous les contrôles PrimeNG (29 fichiers TypeScript, environ 112 classes PrimeIcons résiduelles), préparer un design system Staport cohérent et contrôlé sur les écrans, convertir les composants Eager en OnPush/Signals/AsyncPipe là où le contrat le permet, retirer Zone.js, migrer Karma/Jasmine vers Vitest, résoudre les avertissements NG01354/NG0956, ajouter E2E et contrôle axe, traiter les vulnérabilités npm et les peer dependencies, obtenir npm ci sans --force, ramener le SCSS du wizard sous budget, compléter les tests des domaines/formulaires et synchroniser docs/conventions/TODO. L'utilisateur demande les tests à tous les niveaux.

Continue jusqu'à la matrice de conformité et toutes les validations terminées. Committe les lots cohérents sur main; push seulement les commits validés. Ne touche pas à la production, ne supprime pas le volume PostgreSQL 17, ne lance pas de migration production sans sauvegarde/rehearsal/plan de rollback. Si un vrai choix métier ou une décision d'architecture manque, consigne précisément les options et le blocage au lieu d'inventer.
```

## Conditions de clôture

Clôturer seulement lorsque la matrice de conformité complète est renseignée et passée; pas de peer conflict, licence inconnue, audit vulnérabilités non traité, erreur de build, test manquant exigé, documentation divergente, migration production non planifiée, ou exception implicite. Les choix commerciaux externes (licence PrimeNG, vraie fenêtre de migration prod) doivent être confirmés par le propriétaire si nécessaire.

# ADR 0001 — Adoption du socle Staport dans ERP-RH

- **Statut :** accepté
- **Date :** 2026-10-10
- **Source normative :** conventions centralisées dans `conventions/`
- **Périmètre :** règles transverses et trajectoire de modernisation. L'adhésion globale est
  autorisée ; les migrations restent découpées, testées et documentées pour pouvoir être vérifiées.

## Contexte

ERP-RH possède déjà PostgreSQL + Flyway, un RBAC dynamique par domaine, Envers et un journal
d'audit. La normalisation doit préserver ces règles métier et rendre le socle commun réutilisable
par G-Banque et les futurs projets. Le frontend était Angular 17 / PrimeNG (migré le 2026-10-10 vers Angular 22 et le kit Staport sur Angular Aria/CDK : aucun usage PrimeNG ne subsiste).

## Décisions

1. Les fichiers de `conventions/` à la racine sont la source de vérité normative et le blueprint
   éprouvé par ERP-RH. Les applications suivantes peuvent reprendre ce corpus puis documenter leurs
   différences de métier et de pile dans leurs propres `docs/` et ADR. Les règles métier et
   permissions restent locales à chaque application.
2. PostgreSQL + Flyway, RBAC dynamique par domaine et modèle d'audit ERP-RH sont les références
   communes. Chaque application garde sa propre base et son propre historique de migration.
3. La cible UI est Angular 22 stable (baseline vérifiée au 2026-10-10 : 22.2.2), Signals/Signal Forms
   adaptés au cas, Tailwind CSS 4, Angular Aria/CDK et le design system Staport avec Lucide. AG Grid
   Community est réservé aux grilles qui nécessitent ses interactions avancées. Le passage Angular
   par majors et le remplacement des composants se font par étapes, avec un pilote représentatif.
4. Les skills métier restent dans le domaine de chaque application. Dans ERP-RH, elles indexent les
   README et RBAC existants ; elles ne dupliquent pas les règles et ne donnent aucune autorisation.
   Le squelette commun conserve son dossier `domains/` vide.
5. Pour les applications Spring Boot, Spring AI est le choix IA par défaut ; LangChain4j peut être
   retenu si un besoin vérifié le justifie et si le choix est documenté. Chaque application qui
   fournit des capacités aux agents les expose au moyen d'outils MCP authentifiés, reliés à ses
   propres cas d'usage métier. Une IA globale d'entreprise est une étape ultérieure, après la
   conformité des applications connectées ; elle consommera leurs outils MCP et n'accédera pas à
   leurs bases. Un graphe d'orchestration ou un composant Python n'est retenu que si un besoin le
   justifie. Les mesures BI conservent une définition unique dans les services/projections du domaine.
6. La stratégie de test couvre les niveaux statique, unitaire, composant, intégration PostgreSQL,
   contrat, E2E et non-fonctionnel selon le risque ; les accès, migrations, exports et futurs outils
   IA ont des tests négatifs pertinents.

## Trajectoire ERP-RH

| Étape | Travail | Critère de sortie |
|---|---|---|
| 0 — Socle | Version locale, instructions agents et skills par domaine | Un agent trouve les sources communes, métier et RBAC sans recopier les règles |
| 1 — Baseline | Java/Maven/README/CI alignés ; fixer Node/NPM au runtime requis par Angular 22 | Backend Java 21 testé ; build frontend/CI sur runtime explicite et supporté |
| 2 — Frontend | Monter Angular par majors supportées ; valider un écran pilote avec Signals, Aria/CDK, Tailwind, Lucide et tests de composants | Pilote accessible, responsive, testé et validé visuellement avant généralisation |
| 3 — Composants | Remplacer progressivement les dépendances de présentation et leurs tests | Aucun écran migré ne dépend de PrimeFlex/PrimeIcons ; pas de bascule globale non testée |
| 4 — Qualité | Ajouter une suite E2E ciblée et couvrir les trous identifiés par `docs/testing.md` | Parcours login, permissions et paie critiques exécutables en CI |
| 5 — Base | PG17 local migré logiquement vers un nouveau volume PG18 ; PostgreSQL de production reste à migrer | PG18 local validé sous tests ; procédure documentée ; production migrée avec maintien du volume PG17 |
| 6 — BI/IA applicative | Cataloguer les KPI ; choisir un cas IA/MCP propre à ERP-RH | Autorisation par utilisateur, audit, citations, tests d'évaluation et limites mesurables |
| 7 — IA d'entreprise (cible) | Après les applications connectées, orchestrer leurs outils MCP dans une application dédiée | Aucun accès direct aux bases ; autorisations conservées par chaque application ; audit et évaluation transverses |

## Contraintes et points à vérifier

- La mise à niveau majeure PostgreSQL ne doit pas remplacer l'image d'un volume persistant sans
  procédure de migration, sauvegarde restaurable et répétition.
- Angular et Node doivent être vérifiés ensemble selon la matrice officielle de compatibilité au
  moment de l'étape. L'environnement local observé en octobre 2026 ne satisfait pas encore la version
  Node minimale du profil Angular ciblé.
- Vérifier la licence et l'éligibilité de toute version majeure de bibliothèque UI avant adoption.
  Aucun choix PrimeNG majeur ne doit être fait sur la seule base de compatibilité Angular.
- Les migrations de données G-Banque restent hors de cet ADR ERP-RH et nécessitent un plan dédié.

## Conséquences

Les mises à jour du socle arrivent sous forme de diff versionné et relu. ERP-RH garde ses README,
matrices RBAC, schéma et conventions d'implémentation comme sources métier locales. Chaque étape de
modernisation peut être livrée indépendamment et doit tenir à jour les documents concernés.

# Frontend

> Conventions Angular applicables à tout le frontend. Document générique et réutilisable d'un
> projet à l'autre — aucun nom de domaine métier propre à un projet particulier n'y figure.

## Technologies et version

Le socle Staport suit la dernière version majeure **stable** d'Angular validée dans la version épinglée du standard. Au 10 octobre 2026, la cible ERP-RH est Angular **22.2.2**. Angular, Angular CDK/Aria, Node.js et TypeScript doivent respecter leurs matrices de compatibilité officielles et les plages de pairs; les versions doivent être verrouillées dans le lockfile.

* Angular standalone, lazy-loaded, Signals pour l'état réactif et détection zoneless (zoneless est le défaut d'Angular 21+; ne pas réactiver Zone.js par provider).
* Angular Aria/CDK comme primitives accessibles et fondation des composants Staport, sans dépendance à une suite commerciale de widgets.
* Tailwind CSS 4 pour les utilitaires, SCSS/CSS pour les composants et jetons de design.
* Lucide Angular pour les icônes. PrimeNG, PrimeIcons et PrimeFlex ne sont pas utilisés.
* Signal Forms (`@angular/forms/signals`) pour tous les formulaires et champs de saisie ; Reactive Forms et `ngModel` ne sont plus utilisés. RxJS reste le format HTTP et flux.

Les composants partagés composent Aria/CDK avec le langage visuel Staport; utiliser des éléments HTML natifs lorsque l'interaction est simple. Ne jamais ajouter PrimeNG, PrimeIcons ou PrimeFlex. Toute évolution de ce choix est une décision d'architecture et exige une revue des coûts, licences, accessibilité, zoneless, bundle et maintenance.

## Workflow Angular

1. Vérifier la dernière version stable et les matrices officielles Angular/Node/TypeScript/RxJS; épingler Node dans `.nvmrc`, `engines` et CI.
2. Mettre à jour une version majeure à la fois avec `ng update`, examiner chaque migration générée et garder les paquets Angular alignés.
3. Examiner peer dependencies et licences de chaque dépendance directe ou transitive. Préférer les API Angular natives, Aria/CDK et composants Staport.
4. Pour chaque étape, exécuter installation reproductible (`npm ci`), lint/typecheck, tests unitaires/composants, build de production et tests E2E. Ne pas masquer une incompatibilité avec `--force`, `legacy-peer-deps` ou une augmentation arbitraire des budgets.
5. Examiner notes de version et dépréciations; valider navigation, accessibilité, thèmes, responsive, performances et bundle sur les parcours concernés.

Une migration n'est terminée que lorsque le lockfile est reproductible sans contournement, que la CI utilise Node supporté, que la licence est confirmée et que les validations sont vertes.

---

# Architecture

Le frontend est organisé par domaines métier.

Exemple :

```text
portail/
├── <domaine-a>/
├── <domaine-b>/
├── <domaine-c>/
└── ...
```

L'organisation doit refléter les domaines du backend.

Ne jamais créer un dossier technique regroupant plusieurs domaines.

---

# Composants

* Tous les composants, directives et pipes applicatifs sont standalone; ne pas créer de NgModule métier.
* Un composant possède une seule responsabilité.
* Les composants contiennent uniquement la logique de présentation.
* Toute logique métier appartient à un Service.
* Conserver le défaut OnPush de la version Angular cible et expliciter `ChangeDetectionStrategy.OnPush` quand cela rend l'intention lisible. Importer seulement les directives/composants Aria/CDK nécessaires.
* Les composants métier restent dans leur domaine; les composants Staport partagés exposent une API explicite et cohérente.

### Signals et état réactif

* Utiliser `signal()` pour l'état local modifiable et `computed()` pour les valeurs dérivées. Réserver `effect()` à la synchronisation avec un effet externe, pas à la copie d'un signal vers un autre.
* Exposer un état en lecture seule lorsque sa mutation doit rester privée. Utiliser Signals pour l'état consommé par le template et les API Signal stables de la version ciblée.
* Les Observables restent le format des API HTTP, événements continus et orchestration d'annulation/retry. Convertir avec `toSignal()` à la frontière lorsque le template consomme le flux comme état; ne pas conserver en parallèle le même état dans un Observable et un Signal.
* Utiliser `resource()` / `httpResource()` pour des lectures déclaratives pilotées par Signals lorsque l'annulation et l'état `loading/error/value` simplifient réellement le parcours. Les Resources sont réservées aux lectures, jamais aux mutations.
* Ne jamais compter sur Zone.js pour actualiser un champ ordinaire depuis une souscription. Utiliser Signals, `AsyncPipe`, événements Angular ou une API de détection documentée.
* Utiliser `takeUntilDestroyed()` pour les souscriptions liées au cycle de vie; toute souscription manuelle doit avoir une durée de vie explicite.

### Zoneless

* Angular 21+ est zoneless par défaut : ne pas fournir `provideZoneChangeDetection()`. Retirer Zone.js des dépendances, polyfills et tests. Toute exception d'un adaptateur tiers est isolée, documentée et testée.
* Vérifier les mises à jour après HTTP, formulaires, navigation/guards, dialogs, notifications, timers et événements des composants tiers sans Zone.js.
* Le socle doit compiler et exécuter tests/build sans Zone.js. Tester les notifications de rendu asynchrones, et ne pas ajouter une dépendance Zone comme correctif.

---

# Injection de dépendances

Toujours utiliser :

```ts
inject()
```

Ne jamais utiliser l'injection par constructeur.

Exemple :

```ts
private readonly xxxService = inject(XxxService);
```

---

# Services

Les Services :

* centralisent les appels HTTP ;
* portent la logique applicative côté frontend ;
* sont l'unique accès au backend.

Un composant ne fait jamais d'appel HTTP directement.

---

# Formulaires (Signal Forms)

Tous les formulaires, y compris les barres de filtres et les champs isolés (recherche, confirmation), utilisent Signal Forms (`form()`, `FormField`, `FormRoot`) ; l'API est stable depuis Angular 22. Reactive Forms (`FormBuilder`, `FormGroup`, `formControlName`) et Template Driven Forms (`ngModel`) sont interdits.

* **Modèle** : un `signal` typé porte les valeurs ; `form(modele, schema, { submission })` en dérive les champs. Les règles de validation sont dans le schéma (`required`, `maxLength`, `min`, `email`, `validate`, `disabled`), chacune avec son `message` : le message affiché est celui de la règle. Une règle métier réutilisable est une fonction de schéma (ex. `motDePasseConforme(chemin)`).
* **Gabarit** : `<form [formRoot]="form">` (soumission sans rechargement, `novalidate`), `[formField]="form.champ"` sur un champ natif ou un contrôle du kit, `<stp-field-error [field]="form.champ" />` pour le message sous le champ (annoncé, affiché une fois le champ touché ou le formulaire soumis).
* **Soumission** : l'action est déclarée dans `submission` (`action`, et `onInvalid: focaliserPremiereErreur`). Elle marque tous les champs touchés, ne s'exécute que si le formulaire est valide et fournit `form().submitting()` pour le bouton (plus de signal `saving` à la main). Une requête HTTP s'attend avec `attendreEnregistrement` : une erreur HTTP, déjà notifiée par `errorInterceptor`, laisse le formulaire affiché.
* **État** : charger un enregistrement = `modele.set(...)` (le formulaire reste intact) ; enregistrer = `form().reset()` avant de naviguer, de sorte que `unsavedChangesGuard` (qui lit `form().dirty()`) ne pose pas de question.
* **Filtres de liste** : le modèle des filtres est un signal ; `debounce(chemin.champ, 300)` retarde les champs texte, `surChangementDesFiltres(filtres, () => this.onSearch())` relance la recherche (sauf à l'initialisation) ; « Réinitialiser » = `form().reset(valeursVides())`.
* **Contrôles du kit** : un champ du kit est un `FormValueControl` (`value = model()`, `disabled = input()`, `touch = output()`, `focus()`), jamais un `ControlValueAccessor`. Ses bornes (`min`, `max`) viennent des règles du schéma.

Interdictions :

* `ngModel` et Reactive Forms ;
* mélanger un champ Signal Forms et un champ à l'état propre dans un même formulaire.

---

# Sélecteurs (listes déroulantes)

Un composant générique unique sert de sélecteur pour toute liste adossée à une source de données
back-end — jamais un composant de sélection piloté par une liste chargée intégralement en mémoire
au montage du composant, même pour une liste de référence de petite taille (la pagination/recherche
existe déjà côté backend pour la lister ailleurs ; un sélecteur la réutilise plutôt que de charger
"tout d'un coup").

## Cardinalité

* Un filtre de liste (recherche/filtre d'une page de résultats) sur une dimension à cardinalité
  réelle (plus de 2-3 valeurs typiques) est **toujours** en sélection multiple.
* Un champ de formulaire qui pilote une relation unique de l'enregistrement édité (une clé
  étrangère à cardinalité 1) reste en sélection simple — le multiselect n'a de sens que là où
  sélectionner plusieurs valeurs à la fois est une opération métier valide ; l'appliquer à une
  relation unique permettrait d'enregistrer un état métier impossible.
* Une relation réellement multiple (many-to-many) reste en sélection multiple, dans les deux
  contextes (formulaire et filtre).
* Exception admise, jamais un oubli silencieux mais une exception explicite documentée à l'endroit
  du code concerné : un filtre à cardinalité intrinsèquement binaire (ex. un statut actif/inactif)
  peut rester en sélection simple si le multiselect n'apporterait rien.

## Recherche et chargement différé

* Tout sélecteur recherche côté serveur au fil de la frappe (jamais un filtre client sur une liste
  déjà entièrement chargée) — débounce obligatoire.
* Tout sélecteur charge ses options par page (chargement différé) plutôt qu'une liste complète —
  y compris pour une liste de référence de petite taille, par cohérence : un seul comportement,
  jamais une exception "parce que c'est petit aujourd'hui" qui redevient un problème demain.
* Un domaine qui expose un sélecteur fournit une implémentation du contrat correspondant (une
  méthode de pagination filtrée + une résolution par identifiant, pour afficher correctement une
  valeur déjà sélectionnée avant même que sa page ne soit chargée, ex. en modification) — jamais
  une duplication de la pagination/du debounce dans chaque composant consommateur.

## Largeur du panneau

Le panneau d'options d'un sélecteur ne doit jamais être limité à la largeur (étroite) du champ qui
l'ouvre, notamment dans une barre de filtres : les libellés longs seraient tronqués et une barre de
défilement horizontale apparaîtrait. Le composant partagé impose une largeur minimale issue des
tokens `--select-panel-min-width` / `--select-panel-max-width` (`_tokens.scss`) et masque le
défilement horizontal — ne jamais contourner cette règle dans un écran, corriger le composant.

## Composant partagé

Le composant partagé encapsule le composant de sélection simple et le composant de sélection
multiple de la librairie UI derrière un seul point d'entrée (`FormValueControl`, lié par `[formField]`) — la valeur
exposée au formulaire hôte reste un identifiant (ou un tableau d'identifiants), jamais l'objet
complet, pour ne rien changer aux DTO existants. Toute nouvelle liste déroulante du projet réutilise
ce composant plutôt que d'implémenter sa propre pagination/recherche.

---

# Tableaux

Tout tableau de données utilise un composant Staport accessible bâti sur HTML natif et Aria/CDK. Pour une grille très dense
ou nécessitant virtualisation avancée, AG Grid Community peut être chargé à la demande après validation du contrat, de la
licence et du bénéfice mesuré. Toute grille respecte les exigences suivantes :

* **Tri** : toute colonne de données est triable au clavier et à la souris ; seules les
  colonnes d'actions ne le sont pas.
* **Redimensionnement** (`[resizableColumns]="true"`, `columnResizeMode="expand"`,
  `pResizableColumn`), **réordonnancement** par glisser-déposer (`[reorderableColumns]="true"`,
  `pReorderableColumn`) et **choix des colonnes visibles** (composant partagé
  `app-column-chooser`).
* **Pagination** avec total lisible, page courante, options de taille et navigation accessible.
* **Filtres en temps réel** (délai de saisie de 300 ms) : aucun bouton « Rechercher », seul un bouton
  « Réinitialiser » reste dans la barre de filtres.

## Style unique

Tous les tableaux ont **le même style**, défini une seule fois dans le design system Staport
(`styles/_tables.scss`, couleurs dans les tokens `--table-*` de `_tokens.scss`) : lignes compactes, grille
visible, en-têtes en majuscules sur fond clair, alternance de lignes, survol, paginateur compact. Les classes d'alignement
(`text-center`, `text-right`) et de graisse (`font-semibold`, `font-bold`) utilisées par `TableColumn.align` et
`cellClass` y sont définies. **Aucun écran ne redéfinit ces règles** : toute évolution du style se fait dans
`_tables.scss`, pour tous les tableaux à la fois.

## Colonnes pilotées par la configuration

Les colonnes sont déclarées une seule fois dans le composant (`TableColumn`, voir
`shared/table/table-columns.ts`) et regroupées dans un `ColumnState` :

```ts
readonly columns = new ColumnState([{ field: 'code', header: 'Code' }, ...]);
readonly rowsPerPage = TABLE_ROWS_PER_PAGE;
readonly pageReport = TABLE_PAGE_REPORT;
```

L'en-tête et le corps parcourent `columns.visible` (`@for`), le corps choisissant le rendu de chaque
colonne par `@switch (col.field)` ; la table reçoit `[columns]="columns.visible"` et
`(onColReorder)="columns.onReorder($event.columns)"`. Le corps ne doit **jamais** écrire ses `<td>`
en dur dans l'ordre d'origine : le réordonnancement ne déplacerait alors que l'en-tête. Le
`colspan` du message « aucun résultat » vaut `columns.visible.length + 1` (colonne d'actions).

Un en-tête **groupé** sur plusieurs lignes (`colspan`/`rowspan`) est à proscrire sauf besoin métier documenté et validation
accessibilité des en-têtes associés.

## Tri

* Tableau paginé côté serveur (`[lazy]="true"`) : `TableColumn.sortField` porte le chemin de propriété
  de l'entité (ex. `chantier.code` pour une relation) transmis tel quel au paramètre `sort` du
  backend (`Pageable`) — chaque champ ajouté doit être testé contre le backend (un chemin invalide
  provoque une erreur 500). Une relation facultative (clé étrangère nullable) ne doit pas faire
  disparaître les lignes sans valeur du résultat trié.
* Tableau non paginé côté serveur (liste complète en mémoire, ex. rôles, utilisateurs) : tri,
  pagination et filtres sont faits côté client par le composant Staport ; `sortField` peut cibler un nombre
  d'éléments (ex. `permissions.length`).
* Une nouvelle colonne s'ajoute toujours avec son tri, dans le même changement.

---

# Templates

Utiliser exclusivement le nouveau Control Flow Angular.

Autorisé :

```html
@if (...)

@for (...)

@switch (...)
```

Interdit :

```html
*ngIf

*ngFor

*ngSwitch
```

---

# Gestion de l'état

* RxJS/Observables pour les flux asynchrones (HTTP, événements répétés dans le temps) — un
  intercepteur ou un Service qui expose un flux continu reste en RxJS.
* Angular Signals (`signal`, `computed`) — autorisés, choix confirmé le 2026-10-03 (déjà utilisés par
  `AuthService` et `AppComponent`) — pour un état synchrone simple porté par un Service ou un
  composant (ex. utilisateur courant, état d'authentification, dérivés calculés d'un état local) —
  préférer un Signal à une propriété de classe mutable brute dès que des composants doivent réagir
  à ce changement d'état.
* Ne pas mélanger les deux paradigmes pour la même donnée dans le même Service — un état est soit
  un flux RxJS, soit un Signal, jamais dupliqué sous les deux formes en parallèle.

---

# Lazy Loading

Toute nouvelle page utilise :

* loadComponent
* loadChildren

Ne jamais importer directement une page dans les routes.

---

# Gestion des erreurs

Toutes les erreurs HTTP sont gérées par l'intercepteur global.

Les composants :

* ne montrent jamais les erreurs HTTP ;
* ne créent jamais de Toast d'erreur.

Un callback `error` est autorisé uniquement pour :

* arrêter un loading ;
* remettre un formulaire dans un état cohérent ;
* effectuer un traitement local.

---

# Notifications

Les messages de succès sont gérés localement.

Les messages d'erreur sont gérés uniquement par l'intercepteur HTTP.

---

# RBAC

Les autorisations proviennent des permissions effectives de l'utilisateur courant (voir
`conventions/security.md`) — jamais d'un rôle codé en dur.

Un Service d'authentification centralise l'état de connexion et expose au minimum :

```ts
hasPermission(code: string): boolean
hasAnyPermission(codes: string[]): boolean
```

Les guards de route utilisent ce Service — un guard d'authentification simple (utilisateur connecté
ou non) et un guard de permission générique paramétré par les données de route :

```ts
{ path: 'xxx', canActivate: [permissionGuard], data: { permission: 'XXX_MANAGE' } }
```

Les éléments de navigation et boutons sensibles (ex. suppression) se conditionnent de la même façon
au niveau du template :

```html
@if (authService.hasPermission('XXX_DELETE')) { ... }
```

Toute nouvelle fonctionnalité définit explicitement ses autorisations.

---

# Sécurité

Ne jamais construire du HTML contenant une donnée utilisateur.

Interdiction :

```ts
`<strong>${username}</strong>`
```

Utiliser un template Angular lorsque du contenu formaté est nécessaire.

---

# Design System

Toutes les couleurs, espacements et tailles proviennent des Design Tokens.

Utiliser :

```scss
var(--...)
```

Ne jamais écrire directement :

* couleurs hexadécimales ;
* tailles ;
* espacements ;
* rayons ;
* ombres

lorsqu'un token existe déjà.

Si un token manque, l'ajouter dans `_tokens.scss` — avec sa valeur dans les deux thèmes (clair et sombre).

Les thèmes, les jetons sémantiques, la typographie et le mouvement sont décrits dans `design-system.md`.

---

# Communication avec le backend

Le frontend consomme uniquement les DTO exposés par l'API.

Ne jamais dépendre :

* des entités JPA ;
* des structures internes du backend.

Toute évolution d'un contrat API doit être répercutée sur le frontend.

---

# Documentation

Après toute évolution d'un module frontend, mettre à jour la documentation concernée dans `docs/`
(structure propre à chaque projet — voir son propre `README.md`).

---

# Qualité et tests

* Angular CLI Vitest (`@angular/build:unit-test`) est le runner unitaire par défaut. Les nouveaux tests ne dépendent pas de Jasmine, Karma ou Zone.js; les suites existantes ont migré vers Vitest avec des fake timers natifs (ERP-RH, 2026-10-10 ; E2E Playwright + axe dans `frontend/e2e/`).
* Tests de composants sous DOM simulé pour états, clavier, Signals, formulaires et erreurs; utiliser les harness Angular/CDK lorsqu'ils existent plutôt que tester les classes CSS internes.
* Les tests d'intégration vérifient router, guards, intercepteurs, services HTTP et contrats avec le serveur; employer des fixtures représentatives et des assertions sur les statuts/permissions.
* Les E2E utilisent Playwright dans les principaux navigateurs ciblés, avec des parcours auth, autorisation par domaine, CRUD critique, paie et exports. Les jeux de données sont isolés et réinitialisables.
* Exécuter axe-core dans les E2E sur les parcours représentatifs; vérifier manuellement clavier, lecteur d'écran, contraste, zoom, mobile, thèmes et reduced-motion avant livraison.
* CI exécute `npm ci`, lint, typecheck, tests unitaires, build production, E2E critiques et vérifications de dépendances/licences. Mesurer couverture et budgets; ne pas cacher un échec en relevant la limite.

---

# Principes

* Architecture par domaine métier.
* Composants Standalone.
* inject() uniquement.
* Signal Forms pour tous les formulaires.
* Nouveau Control Flow Angular uniquement.
* Zoneless par défaut, Signals pour l'état UI, RxJS pour HTTP/flux et `resource()` seulement pour les lectures.
* Les Services centralisent les appels HTTP.
* Les composants restent centrés sur la présentation.
* Tout tableau de données offre tri, redimensionnement, réordonnancement, choix des colonnes, pagination avec total et filtres en temps réel.
* Les erreurs HTTP sont gérées de manière centralisée.
* Toute nouvelle route est chargée en Lazy Loading.
* Tout sélecteur recherche et charge ses options par page depuis le backend via le composant
  partagé — sélection multiple pour un filtre de liste ou une relation many-to-many, sélection
  simple pour une relation unique d'un enregistrement.
* Les autorisations sont explicites et reposent sur les permissions effectives, jamais un rôle codé en dur.
* Les Design Tokens sont la source de vérité du style.
* Le frontend reste synchronisé avec les contrats du backend.
* Toute fonctionnalité est documentée.
* Aucun code mort ne doit être conservé.
* Toute nouvelle fonctionnalité CRUD doit fournir une expérience utilisateur complète : liste paginée et triable, recherche, filtres si disponibles, création, consultation, modification, suppression (si autorisée), validations, gestion des erreurs, états de chargement et messages de succès.

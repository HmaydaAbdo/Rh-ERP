# Frontend

> Conventions Angular applicables à tout le frontend. Document générique et réutilisable d'un
> projet à l'autre — aucun nom de domaine métier propre à un projet particulier n'y figure.

## Technologies

Le frontend est développé avec :

* Angular 17+
* Standalone Components
* PrimeNG
* RxJS

Toute nouvelle fonctionnalité doit respecter cette stack.

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

* Tous les composants sont Standalone.
* Un composant possède une seule responsabilité.
* Les composants contiennent uniquement la logique de présentation.
* Toute logique métier appartient à un Service.

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

# Reactive Forms

Utiliser exclusivement Reactive Forms.

Interdictions :

* ngModel sur un formulaire (Template Driven Forms)

`ngModel` reste acceptable ponctuellement pour un contrôle isolé hors d'un `FormGroup` (ex. une
case à cocher pilotant un état local simple, sans validation ni soumission) — mais dès qu'un champ
fait partie d'un formulaire soumis, il passe par Reactive Forms.

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
multiple de la librairie UI derrière un seul point d'entrée (`ControlValueAccessor`) — la valeur
exposée au formulaire hôte reste un identifiant (ou un tableau d'identifiants), jamais l'objet
complet, pour ne rien changer aux DTO existants. Toute nouvelle liste déroulante du projet réutilise
ce composant plutôt que d'implémenter sa propre pagination/recherche.

---

# Tableaux

Tout tableau de données utilise `p-table` de PrimeNG avec les fonctionnalités suivantes, **sans
exception** — le tableau d'une nouvelle page les reprend dès sa création :

* **Tri** : toute colonne de données est triable (`pSortableColumn` + `<p-sortIcon>`) ; seules les
  colonnes d'actions ne le sont pas.
* **Redimensionnement** (`[resizableColumns]="true"`, `columnResizeMode="expand"`,
  `pResizableColumn`), **réordonnancement** par glisser-déposer (`[reorderableColumns]="true"`,
  `pReorderableColumn`) et **choix des colonnes visibles** (composant partagé
  `app-column-chooser`).
* **Pagination** avec total : `[paginator]`, `[rowsPerPageOptions]="rowsPerPage"`,
  `[showCurrentPageReport]="true"` et `[currentPageReportTemplate]="pageReport"`.
* **Filtres en temps réel** (délai de saisie de 300 ms) : aucun bouton « Rechercher », seul un bouton
  « Réinitialiser » reste dans la barre de filtres.

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

Un en-tête **groupé** sur plusieurs lignes (`colspan`/`rowspan`) est à proscrire : PrimeNG ne permet
ni de réordonner ni de masquer proprement des colonnes dans un en-tête groupé.

## Tri

* Tableau paginé côté serveur (`[lazy]="true"`) : `TableColumn.sortField` porte le chemin de propriété
  de l'entité (ex. `chantier.code` pour une relation) transmis tel quel au paramètre `sort` du
  backend (`Pageable`) — chaque champ ajouté doit être testé contre le backend (un chemin invalide
  provoque une erreur 500). Une relation facultative (clé étrangère nullable) ne doit pas faire
  disparaître les lignes sans valeur du résultat trié.
* Tableau non paginé côté serveur (liste complète en mémoire, ex. rôles, utilisateurs) : tri,
  pagination et filtres sont faits côté client par `p-table` (`#dt` + `table.filter(valeur, champ,
  'contains')` à chaque changement du formulaire de filtres) ; `sortField` peut cibler un nombre
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
* Angular Signals (`signal`, `computed`) pour un état synchrone simple porté par un Service ou un
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

Si un token manque, l'ajouter dans `_tokens.scss`.

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

# Principes

* Architecture par domaine métier.
* Composants Standalone.
* inject() uniquement.
* Reactive Forms pour tout formulaire soumis.
* Nouveau Control Flow Angular uniquement.
* RxJS pour les flux asynchrones, Signals pour l'état synchrone simple — jamais les deux pour la
  même donnée.
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

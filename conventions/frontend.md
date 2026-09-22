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
* Les erreurs HTTP sont gérées de manière centralisée.
* Toute nouvelle route est chargée en Lazy Loading.
* Les autorisations sont explicites et reposent sur les permissions effectives, jamais un rôle codé en dur.
* Les Design Tokens sont la source de vérité du style.
* Le frontend reste synchronisé avec les contrats du backend.
* Toute fonctionnalité est documentée.
* Aucun code mort ne doit être conservé.
* Toute nouvelle fonctionnalité CRUD doit fournir une expérience utilisateur complète : liste paginée et triable, recherche, filtres si disponibles, création, consultation, modification, suppression (si autorisée), validations, gestion des erreurs, états de chargement et messages de succès.

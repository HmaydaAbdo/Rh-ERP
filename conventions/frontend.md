# Frontend

> Conventions Angular applicables à tout le frontend.

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
├── banque/
├── caution/
├── cmt/
├── leasing/
├── rapprochement/
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
private readonly banqueService = inject(BanqueService);
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

* ngModel
* Template Driven Forms

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

Utiliser :

* propriétés de classe ;
* RxJS ;
* BehaviorSubject lorsque nécessaire.

Ne pas utiliser Angular Signals.

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

Les autorisations proviennent du JWT.

Les guards utilisent :

* systemAdminGuard
* departmentGuard()

Les éléments de navigation utilisent :

```ts
requiredAuthority
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

Après toute évolution d'un module frontend, mettre à jour la documentation concernée.

Voir :

* docs/modules/
* docs/direction/
* docs/guide-utilisateur/

---

# Principes

* Architecture par domaine métier.
* Composants Standalone.
* inject() uniquement.
* Reactive Forms uniquement.
* Nouveau Control Flow Angular uniquement.
* Pas de Signals.
* Les Services centralisent les appels HTTP.
* Les composants restent centrés sur la présentation.
* Les erreurs HTTP sont gérées de manière centralisée.
* Toute nouvelle route est chargée en Lazy Loading.
* Les autorisations sont explicites.
* Les Design Tokens sont la source de vérité du style.
* Le frontend reste synchronisé avec les contrats du backend.
* Toute fonctionnalité est documentée.
* Aucun code mort ne doit être conservé.
* Toute nouvelle fonctionnalité CRUD doit fournir une expérience utilisateur complète : liste paginée et triable, recherche, filtres si disponibles, création, consultation, modification, suppression (si autorisée), validations, gestion des erreurs, états de chargement et messages de succès.
# Frontend

> Application Angular de rh-erp : structure, routes, protection par permission, composants partagés et
> comportement des tableaux. Les règles d'écriture (composants standalone, `inject()`, formulaires
> réactifs, tableaux, sélecteurs…) sont dans `conventions/frontend.md` ; ce document décrit leur
> application dans ce projet.

---

## Vue d'ensemble

| | |
|---|---|
| Emplacement | `frontend/` (code dans `frontend/src/app/`) |
| Technologies | Angular 17 (composants standalone, signaux), PrimeNG 17, PrimeIcons, RxJS, Chart.js (graphiques de la vue Analytique de la paie, via `p-chart`), SCSS |
| Rendu | Application monopage (SPA) ; routes chargées à la demande (lazy loading) par domaine |
| Tests | Jasmine + Karma (voir [../testing.md](../testing.md)) |
| Production | Image nginx qui sert les fichiers statiques et relaie l'API (`frontend/nginx.conf`, voir [../deployment.md](../deployment.md)) |

### Commandes

```bash
cd frontend
npm install
npm start                                   # http://localhost:4200, proxy API vers http://localhost:8080
npm run build                               # build de production dans dist/
npx ng test --watch=false --browsers=ChromeHeadless
```

Le proxy de développement (`frontend/proxy.conf.js`) relaie `/employees`, `/functions`, `/chantiers`,
`/equipes`, `/paie`, `/auth`, `/users`, `/roles`, `/permissions` vers `BACKEND_URL` (défaut
`http://localhost:8080`). Une navigation de page (`Accept: text/html`) reste servie par Angular. Tout **nouveau
préfixe d'API** s'ajoute à `proxy.conf.js` **et** à `nginx.conf`.

---

## Structure

```text
src/app/
├── app.component.*          Coque : barre latérale (menu filtré par permission), en-tête, notifications
├── app.config.ts            Fournisseurs : routeur, intercepteurs, restauration de session au démarrage
├── app.routes.ts            Routes de premier niveau
├── core/
│   ├── auth/                Connexion, mot de passe oublié/réinitialisé, accès refusé, AuthService,
│   │                        guards (authGuard, permissionGuard, homeGuard), intercepteur d'authentification
│   ├── interceptors/        Intercepteur d'erreurs (notification du message de l'API)
│   └── navigation/          nav-items.ts : source unique du menu et de l'écran d'accueil
├── portail/                 Un dossier par domaine, comme côté backend
│   ├── chantier/ employee/ equipe/ function/ paie/
│   │       ├── <domaine>.routes.ts   Routes du domaine, protégées par permission
│   │       ├── list/ form/ details/  Écrans (composants standalone)
│   │       ├── models/               Interfaces TypeScript des DTO
│   │       └── services/             Appels HTTP du domaine
│   └── admin/               Utilisateurs et Rôles (users/, roles/, services/, models/)
└── shared/
    ├── components/
    │   ├── lazy-select/     Sélecteur générique à recherche serveur et chargement différé
    │   ├── month-picker/    Sélecteur de mois en un champ (flèches d'année, 12 tuiles, mois indisponibles grisés)
    │   └── column-chooser/  Choix des colonnes visibles d'un tableau
    ├── directives/          count-up : affiche un nombre en l'animant (compteurs des résumés)
    ├── models/page.model.ts Forme d'une page Spring (content, totalElements, …)
    ├── reference-data/      Adaptateurs de sélecteur par domaine (fonction, chantier, équipe, employé)
    └── table/table-columns.ts  TableColumn, ColumnState, constantes de pagination
```

Les styles globaux et les **tokens de design** (couleurs, espacements, rayons, ombres, largeur des panneaux de
sélection) sont dans `src/styles/_tokens.scss`, exposés en variables CSS (`--color-primary`, `--space-md`, …).
Aucune valeur de design n'est écrite en dur dans un composant.

---

## Routes et permissions

Toutes les routes métier sont **chargées à la demande** et **protégées par une permission** (jamais par un nom
de rôle).

| Route | Écran | Permission |
|---|---|---|
| `/` | Accueil : redirige vers le premier écran du menu autorisé | connecté (`homeGuard`) |
| `/login`, `/forgot-password`, `/reset-password` | Authentification | publique |
| `/acces-refuse` | Permission manquante | connecté |
| `/paie`, `/paie/cartes`, `/paie/analytique`, `/paie/:id` | Les trois vues (tabulaire, cartes, analytique) sous une coque commune avec une barre de contexte partagée dans l'URL, adaptée à la vue, et le détail d'un bulletin | `PAIE_READ` |
| `/paie/new`, `/paie/:id/edit` | Création, modification | `PAIE_WRITE` |
| `/employees`, `/employees/:id` | Employés | `EMPLOYEE_READ` |
| `/employees/new`, `/employees/:id/edit` | | `EMPLOYEE_WRITE` |
| `/chantiers`, `/chantiers/:id` | Chantiers | `CHANTIER_READ` |
| `/chantiers/new`, `/chantiers/:id/edit` | | `CHANTIER_WRITE` |
| `/functions`, `/functions/:id` | Fonctions | `FUNCTION_READ` |
| `/functions/new`, `/functions/:id/edit` | | `FUNCTION_WRITE` |
| `/equipes`, `/equipes/:id` | Équipes | `EQUIPE_READ` |
| `/equipes/new`, `/equipes/:id/edit` | | `EQUIPE_WRITE` |
| `/admin/users`, `/admin/users/new`, `/admin/users/:id/edit` | Utilisateurs | `USER_MANAGE` |
| `/admin/roles`, `/admin/roles/new`, `/admin/roles/:id/edit` | Rôles | `ROLE_MANAGE` |

### Guards

| Guard | Comportement |
|---|---|
| `authGuard` | Non connecté → `/login` |
| `permissionGuard` | Non connecté → `/login` ; permission absente → `/acces-refuse`. Se configure par `data: { permission: 'X' }` ou `data: { permissions: ['X', 'Y'] }` (au moins une) |
| `homeGuard` | Route `/` : premier élément de `NAV_ITEMS` autorisé, sinon `/acces-refuse` |

Un refus mène toujours à `/acces-refuse`, **jamais** à `/` : l'accueil redirige lui-même vers un écran protégé,
ce qui provoquerait une boucle de redirections pour un utilisateur sans droit sur cet écran.

### Menu

`core/navigation/nav-items.ts` (`NAV_ITEMS`) est la **source unique** du menu latéral et de l'écran d'accueil.
Chaque entrée porte la permission de lecture qui la rend visible : Paie, Employés, Chantiers, Fonctions,
Équipes, Utilisateurs (`USER_MANAGE`), Rôles (`ROLE_MANAGE`). **Un nouvel écran s'ajoute dans ce fichier.**

### Boutons d'action

Chaque bouton qui déclenche une action est conditionné par la permission correspondante (méthodes
`canWrite()`, `canDelete()`, `canImport()`, `canExport()`, `canSync()` des composants) : création et
modification (`*_WRITE`), suppression (`*_DELETE`), import et modèle Excel (`*_IMPORT`), export Excel et PDF
(`PAIE_EXPORT`), synchronisation des chantiers (`CHANTIER_SYNC`). Un utilisateur qui n'a que la lecture voit les
données sans aucun bouton d'action. Le détail par écran est dans [../rbac/](../rbac/README.md).

> Le masquage côté interface est un confort : la sécurité réelle est portée par le backend (`@PreAuthorize`).

---

## Session

- Le **jeton d'accès** est conservé **en mémoire** (signal de `AuthService`), jamais dans `localStorage`.
- Le **jeton de rafraîchissement** est un cookie `httpOnly` que le navigateur gère seul.
- Au démarrage, `APP_INITIALIZER` tente de restaurer la session **avant** le routeur ; un échec signifie
  simplement « non connecté ».
- Sur un `401`, `authInterceptor` appelle `refreshOnce()` : un **seul** rafraîchissement est partagé entre les
  requêtes concurrentes (le jeton étant à usage unique, deux appels simultanés s'invalideraient). Après succès, la
  requête est rejouée ; sinon la session est vidée et l'utilisateur renvoyé à `/login`.
- Les appels `auth/*` envoient toujours les cookies (`withCredentials`).

Détail : [../auth/README.md](../auth/README.md).

---

## Composants partagés

### Sélecteur à chargement différé (`app-lazy-select`)

Un seul composant pour **toute** liste déroulante adossée à des données serveur. Il encapsule le sélecteur simple
(`p-dropdown`) et multiple (`p-multiSelect`) de PrimeNG derrière un `ControlValueAccessor` : la valeur exposée au
formulaire est un **identifiant** (ou un tableau d'identifiants), jamais l'objet.

| Entrée | Rôle |
|---|---|
| `source` (obligatoire) | Un `LazySelectSource` : `fetchPage(page, size, search)` et `fetchById(id)` |
| `multiple` | Sélection multiple (filtres de liste) ou simple (relation unique d'un formulaire) |
| `optionLabel`, `dataKey` | Libellé affiché (défaut `label`) et clé (défaut `id`) |
| `pageSize` | Taille d'une page (défaut 30) |
| `appendTo` | `"body"` obligatoire dans un conteneur à débordement contraint (ex. un dialogue) |
| `placeholder`, `filterPlaceholder`, `showClear` | Textes et bouton d'effacement |

Comportement : recherche **côté serveur** à la frappe (délai de saisie), options chargées **page par page**,
et `fetchById` pour afficher la valeur déjà choisie en modification avant même que sa page soit chargée. Le
panneau d'options a une **largeur minimale** (`--select-panel-min-width: 22rem`, maximale 40 rem) pour que les
libellés longs ne soient pas tronqués.

Adaptateurs fournis dans `shared/reference-data/` : `FunctionReferenceService`, `ChantierReferenceService`,
`EquipeReferenceService`, `EmployeeReferenceService` (libellé `displayLabel`). Ils interrogent les endpoints
`/search` des domaines. **Toute nouvelle liste déroulante les réutilise** ; on n'écrit jamais une pagination ou
un délai de recherche dans un composant d'écran.

Règle de cardinalité : filtre de liste → sélection multiple ; relation unique d'un formulaire → sélection
simple ; statut binaire (actif/inactif) → sélection simple.

### Sélecteur de mois (`app-month-picker`)

Sélecteur de mois **en un seul champ** : flèches d'année et 12 tuiles. Valeur : une période `aaaa-MM` (celle de l'API).
`[disponibles]` limite les mois choisissables — les autres sont **grisés** et non sélectionnables, et la navigation
d'année reste entre la première et la dernière année qui en contiennent ; `null` autorise tous les mois (ex. la période
d'un import). Utilisé par l'assistant d'export de la paie (voir `docs/report/README.md`, « Assistant d'export »).

### Compteur animé (`appCountUp`)

Directive qui affiche un nombre en l'animant depuis sa valeur précédente, au format `fr-FR` ; supprimée si
l'utilisateur a demandé moins de mouvement dans son système.

### Tableaux (`p-table`) et choix des colonnes

Tous les tableaux de données — **sans exception** — offrent :

| Fonction | Détail |
|---|---|
| Tri | Sur chaque colonne de données (pas sur la colonne d'actions) ; `sortField` donne le chemin transmis au backend (ex. `chantier.code`) |
| Redimensionnement | Glisser le bord d'un en-tête |
| Réordonnancement | Glisser-déposer un en-tête ; l'ordre est reporté sur le corps du tableau |
| Colonnes visibles | `app-column-chooser` ; au moins une colonne reste affichée |
| Pagination | 10 / 20 / 50 / 100 lignes, avec « 1 - 20 sur 134 — page 1/7 » |
| Filtres en temps réel | Délai de saisie de 300 ms ; **aucun bouton « Rechercher »**, seulement « Réinitialiser » |

**Style unique** : tous les tableaux partagent la classe `app-table` (`src/styles/_tables.scss`, tokens `--table-*`
dans `_tokens.scss`) ; aucun écran ne définit son propre style de tableau.

Les colonnes sont déclarées une seule fois (`TableColumn`, regroupées dans un `ColumnState`, voir
`shared/table/table-columns.ts`) ; l'en-tête et le corps parcourent `columns.visible`. Un en-tête groupé sur
plusieurs lignes est proscrit (PrimeNG ne sait ni réordonner ni masquer ses colonnes). Ajouter une colonne =
l'ajouter à la liste avec son tri, dans le même changement. L'état (ordre, visibilité) n'est **pas** mémorisé
entre deux visites.

| Écran | Colonnes | Filtres | Pagination |
|---|---|---|---|
| Paie | Nom & prénom, Fonction, CIN, Jours trav., J.R.O, J.R.D, Salaire, Prime RO, Prime RD, Total, Obs, Chantier, Équipe, Période | Barre de contexte commune (mois, nom, CIN, et panneau chantiers, fonctions, équipes ; dans l'URL) | Serveur |
| Employés | Nom & prénom, CIN, Fonction, Chantier, Date d'embauche, Statut | Nom, CIN, fonctions, chantiers, statut | Serveur |
| Chantiers | Code, Nom, Désignation, Source, Statut | Code, désignation, statut | Serveur |
| Fonctions | Libellé | Libellé | Serveur |
| Équipes | Code, Libellé | Code, libellé | Serveur |
| Utilisateurs | Username, Email, Rôles, Statut | Username, email, statut | Client (liste complète en mémoire) |
| Rôles | Nom, Description, Permissions | Nom, description | Client |

Pour les tableaux paginés côté serveur, un chemin de tri invalide provoque une erreur `500` : chaque `sortField`
est testé contre le backend.

---

## Assistant d'export de la paie

`portail/paie/export/paie-export-wizard.component.*` : dialogue en étapes guidées (mois, format, équipes, matériel
conditionnel, génération) piloté par des signaux ; les étapes sont une liste calculée (l'étape matériel n'y figure
que si un tableau sera imprimé). Détail fonctionnel : `docs/report/README.md`, « Assistant d'export ».

**Budget de style** : `angular.json` plafonne le SCSS d'un composant à 8 ko (avertissement) et 16 ko (erreur) — relevé
des 2/4 ko par défaut le 2026-10-03 pour cet assistant (~14 ko). Si un autre composant approche la limite, le découper
en sous-composants plutôt que de la relever encore.

## Formulaires, notifications et erreurs

- **Formulaires réactifs uniquement** (`FormBuilder`) ; validation affichée sous le champ une fois touché ; les
  champs obligatoires portent une astérisque.
- Les messages de succès sont des notifications (`MessageService`) ; les erreurs HTTP sont affichées
  automatiquement par `errorInterceptor` avec le `message` renvoyé par l'API.
- Les suppressions demandent une **confirmation** (`ConfirmationService`).
- Les imports Excel affichent un résumé puis, en cas de rejet, le détail de chaque ligne en cause avec sa raison
  (voir [../imports.md](../imports.md)).

## Gestion de l'état

L'état local d'un composant est porté par des **signaux** ou des propriétés ; l'état global se limite à la session
(`AuthService`). Aucune bibliothèque de gestion d'état (décision du 2026-10-03 : les signaux Angular sont
autorisés, pas de NgRx).

---

## Ajouter un domaine ou un écran

1. Créer `portail/<domaine>/` (routes, `list/`, `form/`, `details/`, `models/`, `services/`).
2. Déclarer les routes avec `permissionGuard` (`READ` pour la liste et le détail, `WRITE` pour création et
   modification) et les enregistrer dans `app.routes.ts` (avec `authGuard`).
3. Ajouter l'entrée à `NAV_ITEMS`.
4. Conditionner chaque bouton d'action par sa permission (`canWrite()`…).
5. Pour un tableau : `styleClass="app-table p-datatable-gridlines p-datatable-sm"`, `ColumnState`, `app-column-chooser`, `columns.visible`, tri, pagination, filtres en temps
   réel.
6. Pour une liste déroulante : un adaptateur dans `shared/reference-data/` et `app-lazy-select`.
7. Ajouter le préfixe d'API à `proxy.conf.js` et `nginx.conf`.
8. Mettre à jour [../rbac/](../rbac/README.md) et la documentation du domaine.

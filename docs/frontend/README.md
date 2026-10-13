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
| Technologies | Angular 22.2.2, TypeScript 6.0.3, standalone, composants `OnPush`, Signals, zoneless (Zone.js retiré), Angular Aria + CDK, Lucide Angular, Tailwind CSS 4 (utilitaires), Chart.js (graphiques, chargé à la demande). AG Grid Community n'est pas utilisé : il n'est réservé qu'à une grille avancée au besoin mesuré |
| Kit de composants | `src/app/shared/ui/` (« kit Staport ») : voir [Kit Staport](#kit-staport) |
| Rendu | Application monopage (SPA) ; routes chargées à la demande (lazy loading) par domaine |
| Tests | Vitest (runner Angular `@angular/build:unit-test`, Chromium réel) pour les unités et composants ; Playwright + axe pour les parcours E2E (voir [../testing.md](../testing.md)) |
| Production | Image nginx qui sert les fichiers statiques et relaie l'API (`frontend/nginx.conf`, voir [../deployment.md](../deployment.md)) |

### Commandes

```bash
cd frontend
npm ci                                      # Node 24.15.0, version verrouillée par .nvmrc
npm start                                   # http://localhost:4200, proxy API vers http://localhost:8080
npm run build                               # build de production dans dist/
npm test                                     # tests unitaires et composants (Vitest, Chromium headless ; CHROME_BIN si Chrome n'est pas détecté)
npm run e2e                                  # parcours E2E Playwright contre une API simulée (serveur de dev sur le port 4300)
npm run audit:deps                           # npm audit (vulnérabilités hautes, hors pairs optionnels)
npm run audit:licences                       # licences des dépendances livrées
```

Ne pas employer `--force` ou `legacy-peer-deps` pour masquer les incompatibilités : `npm ci` doit passer sans option.

Le proxy de développement (`frontend/proxy.conf.js`) relaie `/employees`, `/functions`, `/chantiers`,
`/equipes`, `/paie`, `/parametres`, `/auth`, `/users`, `/roles`, `/permissions` vers `BACKEND_URL` (défaut
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
│   ├── navigation/          nav-items.ts : source unique du menu et de l'écran d'accueil ; PageTitleStrategy : titre de l'onglet (« Employés · Staport RH »)
│   └── theme/               ThemeService : thème clair / sombre (attribut data-theme sur <html>)
├── portail/                 Un dossier par domaine, comme côté backend
│   ├── chantier/ employee/ equipe/ function/ paie/
│   │       ├── <domaine>.routes.ts   Routes du domaine, protégées par permission
│   │       ├── list/ form/ details/  Écrans (composants standalone)
│   │       ├── models/               Interfaces TypeScript des DTO
│   │       └── services/             Appels HTTP du domaine
│   └── admin/               Utilisateurs et Rôles (users/, roles/, services/, models/)
└── shared/
    ├── ui/                  Kit Staport (icon, button, badge, dialog, menu, select, table, champs, message, chart, catalogue)
    ├── feedback/            Notifications et confirmations (Signals + CDK A11y)
    ├── components/
    │   ├── lazy-select/     Sélecteur générique à recherche serveur et chargement différé (sur `ui/select`)
    │   ├── month-picker/    Sélecteur de mois en un champ (flèches d'année, 12 tuiles, mois indisponibles grisés)
    │   └── column-chooser/  Choix des colonnes visibles d'un tableau
    ├── text/recherche.ts    Comparaison sans casse ni accents (filtres côté client, filtre des sélecteurs)
    ├── directives/          count-up : affiche un nombre en l'animant (compteurs des résumés)
    ├── models/page.model.ts Forme d'une page du serveur : `content` et `page` (size, number, totalElements, totalPages)
    ├── reference-data/      Adaptateurs de sélecteur par domaine (fonction, chantier, équipe, employé)
    └── table/table-columns.ts  TableColumn, ColumnState, constantes de pagination
```

Les styles globaux et les **tokens de design** sont dans `src/styles/` : `_tokens.scss` (jetons exposés en variables CSS —
`--color-primary`, `--space-md`, `--font-sans`, … — pour les deux thèmes), `_buttons.scss` (boutons et pastilles), `_forms.scss`,
`_page.scss`, `_overlays.scss`, `_motion.scss`, `tailwind.css` (utilitaires Tailwind 4 sans preflight, noms de couleurs/rayons/ombres
alignés sur les jetons) ; le style des tableaux est dans `ui/table/table.component.scss` et celui de chaque composant avec lui.
Aucune valeur de design ne doit être écrite en dur. Règles : `conventions/design-system.md`.

### Mise en page des écrans de liste

Tous les écrans de liste (Employés, Chantiers, Fonctions, Équipes, Utilisateurs, Rôles, Journal, et le tabulaire de la Paie)
ont **la même structure** : titre éditorial, panneau de filtres, barre du tableau, tableau. Pour **Employés, Chantiers, Fonctions,
Équipes, Utilisateurs, Rôles et la Paie**, les **actions** (secondaire, puis l'action principale en bleu plein) sont **dans l'en-tête, à droite du
titre** (`app-page__actions app-page__actions--liste` ; à la Paie, au niveau du titre et des onglets de vue, les mêmes dans les
trois vues) et la barre du tableau ne porte que le total à gauche et le choix des colonnes à droite. Employés et Fonctions
regroupent « Importer » et le téléchargement du modèle Excel dans un seul bouton fractionné. La barre du tableau garde le total,
le choix des colonnes et les outils propres à Journal. Classes : `app-page`, `app-toolbar`, `app-table-bar`
(`src/styles/_page.scss`, voir `conventions/design-system.md`). Le total est celui du serveur (listes paginées) ou des lignes
affichées après filtre (Utilisateurs, Rôles). Un nouvel écran de liste reprend ces classes dès sa création.

### Formulaires, consultations et fenêtres

Même structure partout (classes de `src/styles/_forms.scss`, voir `conventions/design-system.md`) : lien de retour « ← Liste »
au-dessus du titre ; formulaire en grille de champs (libellé en gras, astérisque rouge des champs obligatoires, bordure rouge
et message sous un champ invalide) ; le formulaire d'un bulletin est découpé en **Affectation**, **Jours** et **Rémunération** ;
pied « Annuler » + action principale (collé au bas de l'écran sur téléphone). Une consultation (`app-detail`) affiche
étiquette / valeur ; ses actions sont **Historique** (si `AUDIT_READ`) puis **Modifier** (si `*_WRITE`). Les fenêtres
(`ui/dialog`) ont un style unique ; les confirmations de suppression sont étroites, « Supprimer » en rouge. Dates et nombres
sont en français : `stp-date-input` s'appuie sur le champ date natif du navigateur, `stp-number-input` formate en `fr-FR`.

### Graphiques et mouvement

Graphiques : habillage commun `paie-chart-theme.ts` (couleurs, police et infobulle lues dans les jetons), redessinés à la
bascule de thème, une seule mesure par axe, tableau de données accessible. `stp-chart` est aussi focalisable : flèches gauche/droite
(ou haut/bas) et Début/Fin parcourent ses points, Entrée/Espace sélectionne le point et l'annonce aux technologies d'assistance — voir
`docs/paie/README.md` (Vue Analytique) et
`conventions/design-system.md`. Mouvement : `styles/_motion.scss` (écran qui apparaît, bascule de thème en fondu, squelettes de
chargement, appui sur un bouton), durées et courbe en jetons, supprimé par `prefers-reduced-motion`.

### Accessibilité et qualité

Contrôles de la revue finale (voir `conventions/design-system.md`, section « Accessibilité ») : axe-core ne trouve aucune violation
(WCAG 2.2 A/AA et bonnes pratiques) sur les écrans principaux dans les deux thèmes ; le focus clavier est visible sur tous les
éléments parcourus ; lien d'évitement ; boutons d'icône nommés ; champs étiquetés ; formulaires qui annoncent leurs erreurs, mettent
le focus sur la première et demandent confirmation avant d'être quittés modifiés (`shared/forms/`). Nombres et dates en `fr-FR`.
Ces contrôles sont rejoués à chaque intégration par les tests E2E (`frontend/e2e/`, axe en thème clair et sombre, parcours au clavier). Le build
de production (bundle initial ~555 kB) n'émet aucun avertissement de budget.

### Titres d'onglet

Chaque section déclare un `title` dans `app.routes.ts` (le titre le plus profond l'emporte, ses écrans enfants le gardent) ;
`PageTitleStrategy` y ajoute « · Staport RH ». Un nouvel écran de premier niveau déclare son `title`.

### Responsive

Les points de rupture sont des jetons Sass (`src/styles/_breakpoints.scss`, chemin d'inclusion déclaré dans `angular.json`).
Vérifié de 390 à 1440 px : aucune page ne défile horizontalement (seul le tableau défile, dans sa carte, première colonne
figée), les contrôles font 44 px sur écran tactile, les grilles de formulaire passent à deux puis une colonne, les dialogues
tiennent dans l'écran. Règles : `conventions/design-system.md`, section « Responsive ». Un écran de liste ou de formulaire
nouveau reprend ces règles dès sa création.

### Identité visuelle et thèmes

| | |
|---|---|
| Couleur de marque | Le bleu marine du logo, `#084478` (`--brand-700`, `--color-primary` en thème clair), décliné en échelle `--brand-50` … `--brand-950` ; en thème sombre le bleu d'action s'éclaircit (`#5b9be0`). Un accent minéral chaud (`--color-brand-accent`) reste réservé aux repères secondaires |
| Logo | Monogramme « S » : `src/assets/brand/monogramme.svg` (favicon uniquement) — dessin provisoire, à remplacer par une version vectorielle du logo. Aucun logo dans l'authentification ou le menu latéral |
| Typographie | IBM Plex Sans (texte) et IBM Plex Mono (identifiants), **embarquées** (`@fontsource`, déclarées dans `angular.json`) — l'application fonctionne hors ligne ; `--text-page-title` pour les titres d'écran, `--text-display` réservé à l'accroche d'accueil |
| Thème | Clair ou sombre : suit le système tant que l'utilisateur n'a pas choisi, puis son choix est mémorisé sur ce navigateur ; bouton lune/soleil au bas du menu latéral. Le script d'`index.html` pose `data-theme` avant le premier affichage |
| Menu latéral | Bleu très foncé dans les deux thèmes (`--color-sidebar-*`), repère minéral chaud sur l'écran actif. Sur grand écran, il reste réduit aux icônes (4,5 rem) ; les libellés sont accessibles en infobulle et au clavier, le panneau se déploie au survol ou au focus clavier puis se replie à la sortie. Sur **téléphone et tablette compacte**, il devient un **tiroir** ouvert par le bouton de la barre du haut (fond cliquable, `Échap` ou un choix le referme) |
| Authentification | Connexion, mot de passe oublié et réinitialisation partagent un formulaire centré sur tout le canevas, même si une session est active, posé sur la photographie locale `src/assets/auth/staport-login-atlas.png` générée pour Staport RH. Un voile sombre conserve le contraste ; aucun logo ni liste des fonctions du produit. La composition reste centrée sur téléphone et tablette. |

Le shell de navigation s'affiche ou se masque selon la session et la route d'authentification, mais l'application conserve un seul
`router-outlet` monté. Cela garde stables les contrôles accessibles à popup (sélecteurs, comboboxes) pendant la transition entre
la connexion et un écran protégé.

---

## Routes et permissions

Toutes les routes métier sont **chargées à la demande** et **protégées par une permission** (jamais par un nom
de rôle).

| Route | Écran | Permission |
|---|---|---|
| `/` | Accueil : redirige vers le premier écran du menu autorisé | connecté (`homeGuard`) |
| `/login`, `/forgot-password`, `/reset-password` | Authentification | publique |
| `/acces-refuse` | Permission manquante | connecté |
| `/paie`, `/paie/cartes`, `/paie/analytique`, `/paie/:id` | Les trois vues (tabulaire, cartes, analytique) sous une coque commune avec une même barre de filtres pour les trois (dans l'URL, réinitialisée quand on change de vue), et le détail d'un bulletin | `PAIE_READ` |
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
| `/audit` | **Journal** d'audit (tableau, panneau latéral par entrée) ; l'historique d'un enregistrement s'ouvre en fenêtre depuis le détail d'un bulletin ou d'un employé (bouton **Historique**) | `AUDIT_READ` |

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

## Kit Staport

`src/app/shared/ui/` : composants standalone, `OnPush`, Signals, construits sur Angular Aria/CDK et les jetons (aucune bibliothèque de
widgets tierce). Un composant n'écrit ni couleur ni durée en dur. Le **catalogue** (`/catalogue`, route de développement seulement,
`app.routes.ts`) les montre dans leurs états et sert aux tests E2E d'accessibilité.

| Composant | Rôle | Base |
|---|---|---|
| `stp-icon` | Icône Lucide décorative ; jeu d'icônes dans `ui/icon/icons.ts` (ajouter une icône = l'y ajouter) | `@lucide/angular` |
| `button[stp-button]` / `a[stp-button]` | Bouton natif ; `variant` (primary, secondary, text, danger, danger-text), `icon`, `iconOnly`, `loading` (arrête aussi les `(click)` posés par le parent) | HTML natif |
| `stp-badge` | Pastille de statut (success, warning, danger, info, neutral), contraste calculé par thème | |
| `stp-dialog` | Dialogue modal ou tiroir (`placement="end"`) : piège de focus, Échap, `closable`, panneau en overlay | CDK Overlay + A11y |
| `stp-menu-button`, `stp-split-button` | Menu d'actions (`role="menu"`, flèches, Échap) ; bouton scindé | Angular Aria `menu` |
| `stp-select` | Liste déroulante simple/multiple, panneau contraint à la fenêtre et défilable, navigation clavier qui garde l'option active visible, filtre sans accents, effacement, `loadMore`, valeur `V` ou `V[]` ; en multiple, les valeurs choisies qui ne figurent pas dans les options affichées sont conservées | Aria `combobox` + `listbox`, CDK Overlay |
| `stp-table` | Tableau natif : tri, pagination serveur ou mémoire, redimensionnement/réordonnancement clavier, pied, ligne cliquable | HTML natif |
| `stp-number-input` | Nombre au format `fr-FR`, bornes, décimales | |
| `stp-password-input` | Mot de passe avec afficher/masquer (`aria-pressed`) | |
| `stp-date-input`, `stp-month-input` | Date (champ natif) et mois (sélecteur de mois en popover) ; valeur `Date` | natif / CDK Overlay |
| `stp-message` | Message permanent dans la page | |
| `stp-field-error` | Première erreur Signal Forms annoncée (`role="alert"`) quand le champ touché est invalide | Signal Forms |
| `stp-chart` | Graphique Chart.js (`role="img"`), navigation par flèches, Début/Fin et sélection par Entrée/Espace ; annonce du point courant, `dataSelect` au clic ou au clavier | Chart.js |

Le catalogue `/catalogue` présente les composants partagés sans backend. Il sert à vérifier les variantes visuelles et les états utiles ; ses parcours E2E couvrent axe en thème clair/sombre et interactions clavier ciblées. Les vérifications manuelles de contraste élevé et les états qui ne sont pas atteignables dans cette démonstration restent à consigner dans le rapport de conformité avant de clôturer `design-system.md`.

Clavier du sélecteur : ouverture par clic ou **Flèche bas**, navigation aux flèches, **Entrée** coche/choisit, **Échap** ferme ;
la frappe filtre (sélecteurs filtrables). Conséquence de l'implémentation sur Angular Aria : sans filtre, la frappe de lettres
ne fait pas de saisie prédictive.

---

## Composants partagés

### Sélecteur à chargement différé (`app-lazy-select`)

Un seul composant pour **toute** liste déroulante adossée à des données serveur. Il pilote `stp-select` (Angular Aria combobox +
listbox, panneau en overlay CDK) : contrôle de Signal Forms (`FormValueControl`, lié par `[formField]`), dont la valeur est un **identifiant**
(ou un tableau d'identifiants), jamais l'objet.

| Entrée | Rôle |
|---|---|
| `source` (obligatoire) | Un `LazySelectSource` : `fetchPage(page, size, search)` et `fetchById(id)` |
| `multiple` | Sélection multiple (filtres de liste) ou simple (relation unique d'un formulaire) |
| `optionLabel`, `dataKey` | Libellé affiché (défaut `label`) et clé (défaut `id`) |
| `pageSize` | Taille d'une page (défaut 30) |
| `placeholder`, `filterPlaceholder`, `showClear` | Textes et bouton d'effacement |
| `summaryLabel` | Mode compact d'un filtre multiple, sur une ligne : la valeur choisie seule, puis ce texte à partir de deux (`{0} chantiers`) au lieu de pastilles |
| `ariaLabel` | Nom accessible du champ quand son placeholder disparaît (barre d'outils sans libellé visible) |

Comportement : recherche **côté serveur** à la frappe (délai de saisie), options chargées **page par page** au défilement,
et `fetchById` pour afficher la valeur déjà choisie en modification avant même que sa page soit chargée. Le
panneau d'options a une **largeur minimale** (`--select-panel-min-width: 22rem`, maximale 40 rem) pour que les
libellés longs ne soient pas tronqués. En mode multiple, chaque option présente aussi une case à cocher visible.

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

### Tableaux (`stp-table`) et choix des colonnes

Tableau HTML natif (`table`, `th scope="col"`, `aria-sort`, région défilante nommée et focusable). AG Grid Community ne s'ajoute que
pour une grille avancée avec besoin mesuré.

Tous les tableaux de données — **sans exception** — offrent :

| Fonction | Détail |
|---|---|
| Tri | Sur chaque colonne de données (pas sur la colonne d'actions) ; `sortField` donne le chemin transmis au backend (ex. `chantier.code`) |
| Redimensionnement | Glisser le bord d'un en-tête, ou le focaliser (séparateur) et utiliser les flèches gauche/droite ; largeur bornée entre 60 et 2 000 px |
| Réordonnancement | Glisser-déposer un en-tête, ou **Alt + flèche** sur son bouton de tri ; l'ordre est reporté sur le corps du tableau |
| Colonnes visibles | `app-column-chooser` liste toutes les colonnes métier déclarées ; au moins une colonne reste affichée ; posé dans une barre d'outils avec la classe `en-ligne` (hauteur `--control-height`, sans marge propre) |
| Pagination | 10 / 20 / 50 / 100 lignes, avec « 1 - 20 sur 134 — page 1/7 » |
| Filtres en temps réel | Délai de saisie de 300 ms ; **aucun bouton « Rechercher »**, seulement « Réinitialiser » |

**Style unique** : le style est dans `ui/table/table.component.scss` (tokens `--table-*` de `styles/_tokens.scss`) ; aucun écran ne définit
son propre style de tableau. Un en-tête peut déclarer `shortHeader` pour afficher un libellé compact ; son `header` complet reste annoncé aux technologies d'assistance, visible au survol et utilisé dans le sélecteur de colonnes. Les en-têtes ne sont pas tronqués. Une cellule à texte long porte `cellClass: 'text-truncate'`. L'état vide est nommé par la propriété
`emptyMessage` et présenté dans le tableau. Les seuls tableaux hors `stp-table` sont des listes courtes de lignes d'import ignorées :
elles utilisent `app-static-table-scroll` / `app-static-table` (`styles/_page.scss`), une région de défilement focusable, une légende
accessible et des en-têtes `scope="col"`.

Les libellés d'en-tête et d'option restent intégralement visibles : le texte passe à la ligne et ne dépend pas d'une infobulle pour
être lu. Le sélecteur expose toutes les colonnes déclarées dans `ColumnState`, y compris celles temporairement masquées. Les
sélections multiples affichent une case à cocher par option, en conservant la sélection accessible du listbox.

Les colonnes sont déclarées une seule fois (`TableColumn`, regroupées dans un `ColumnState`, voir
`shared/table/table-columns.ts`) ; l'en-tête et le corps parcourent `columns.visible`. Un en-tête groupé sur
plusieurs lignes est proscrit (il ne se réordonne ni ne se masque). Ajouter une colonne =
l'ajouter à la liste avec son tri, dans le même changement. L'état (ordre, visibilité) n'est **pas** mémorisé
entre deux visites.

| Écran | Colonnes | Filtres | Pagination |
|---|---|---|---|
| Paie | Nom & prénom, Fonction, CIN, Nombre de jours travaillés, Jours de récupération ouvrables, Jours de récupération du dimanche, Salaire mensuel, Prime de roulage ordinaire, Prime de roulage du dimanche, Salaire total, Observation, Chantier, Désignation du chantier, Équipe, Libellé de l’équipe, Période | Barre de filtres commune aux trois vues, toute visible (mois, nom, CIN, chantiers, équipes, fonctions ; dans l'URL) | Serveur |
| Employés | Nom & prénom, CIN, Fonction, Chantier, Date d'embauche, Statut | Nom, CIN, fonctions, chantiers, statut | Serveur |
| Chantiers | Code, Nom, Désignation, Source, Statut | Code, désignation, statut | Serveur |
| Fonctions | Libellé | Libellé | Serveur |
| Équipes | Code, Libellé | Code, libellé | Serveur |
| Utilisateurs | Username, Email, Rôles, Statut | Username, email, statut | Client (liste complète en mémoire) |
| Rôles | Nom, Description, Permissions | Nom, description | Client |
| Journal | Date, Catégorie, Action, Résultat, Utilisateur, Origine, Cible, Éléments, Motif ; détail des changements : Champ, Avant, Après | Dates, utilisateur, catégorie, action, résultat, entité, identifiant de requête | Serveur (tri par défaut : date décroissante) |

Pour les tableaux paginés côté serveur, un chemin de tri invalide provoque une erreur `500` : chaque `sortField`
est testé contre le backend.

Contrat du composant : `[lazy]="true"` (le tableau émet `lazyLoad` à l'initialisation puis à chaque page/tri/taille, le parent charge et
renvoie `value` et `totalRecords`) ou mode mémoire (tri et pagination faits par le tableau) ; gabarits `stpCell` (cellule),
`stpRowActions` (colonne d'actions), `stpFooter` (totaux) ; `rowClickable` + `rowClick` pour une ligne cliquable (Entrée au clavier).

---

## Assistant d'export de la paie

`portail/paie/export/` : dialogue en étapes guidées (mois, format, chantier en PDF, équipes, matériel conditionnel, génération). La coque
(`paie-export-wizard.component.*`) porte la fenêtre, le bandeau et le pied ; `paie-export.store.ts` porte l'état (signaux) et la logique ;
chaque étape est un composant de `etapes/`. Les étapes sont une liste calculée (chantier seulement en PDF, matériel seulement si un tableau
sera imprimé). Détail fonctionnel : `docs/report/README.md`, « Assistant d'export ».

**Budget de style** : `angular.json` plafonne le SCSS d'un composant à 8 ko (avertissement) et 16 ko (erreur) — relevé
des 2/4 ko par défaut le 2026-10-03 pour cet assistant (~15,7 ko avant le 2026-10-10). **Résolu** : l'assistant est découpé en une coque, un store (`paie-export.store.ts`, fourni par la coque) et
un composant par étape (`etapes/`, styles partagés dans `etapes/_commun.scss`) ; aucun composant ne dépasse le budget.

## Formulaires, notifications et erreurs

- **Signal Forms** pour tous les formulaires (2026-10-10) : modèle `signal` typé, `form(modele, schema, { submission })`, `<form [formRoot]>`,
  `[formField]` sur les champs, `<stp-field-error>` pour le message sous le champ (une fois touché) ; les champs obligatoires portent une
  astérisque. Les champs du kit (`stp-select`, `stp-number-input`, `stp-date-input`, `stp-month-input`, `stp-password-input`,
  `app-lazy-select`) sont des `FormValueControl` (`value = model()`, `disabled`, `touch`, `focus()`). Règles dans le schéma, soumission
  par `submission.action` (`form().submitting()` pour le bouton, `focaliserPremiereErreur` si invalide), `form().reset()` après
  enregistrement. Filtres de liste : `debounce` sur les champs texte et `surChangementDesFiltres`. Voir `conventions/frontend.md`, « Formulaires ».
- Les messages de succès passent par `NotificationService`; les erreurs HTTP sont publiées automatiquement par `errorInterceptor` avec le `message` renvoyé par l'API (sauf la restauration de session au démarrage, `auth/refresh`, silencieuse : un visiteur sans session n'a pas d'erreur à voir). L'hôte partagé présente ces notifications avec rôles ARIA et fermeture manuelle.
- Les suppressions et sorties de formulaire modifié passent par `ConfirmDialogService`; son dialogue modal utilise CDK A11y (piège de focus, Échap, focus initial) et le design system Staport.
- Les imports Excel affichent un résumé puis, en cas de rejet, le détail de chaque ligne en cause avec sa raison
  (voir [../imports.md](../imports.md)).

## Gestion de l'état

L'état local d'un composant est porté par des **signaux** (tous les composants sont `OnPush`) ; l'état global se limite à la session
(`AuthService`). Aucune bibliothèque de gestion d'état (décision du 2026-10-03 : les signaux Angular sont
autorisés, pas de NgRx).

---

## Ajouter un domaine ou un écran

1. Créer `portail/<domaine>/` (routes, `list/`, `form/`, `details/`, `models/`, `services/`).
2. Déclarer les routes avec `permissionGuard` (`READ` pour la liste et le détail, `WRITE` pour création et
   modification) et les enregistrer dans `app.routes.ts` (avec `authGuard`).
3. Ajouter l'entrée à `NAV_ITEMS`.
4. Conditionner chaque bouton d'action par sa permission (`canWrite()`…).
5. Pour un écran de liste : classes `app-page`, `app-toolbar` et `app-table-bar` (voir ci-dessus). Construire le tableau avec
   `stp-table`, `ColumnState`, `app-column-chooser`, `columns.visible`, tri, pagination et filtres en temps réel.
6. Pour une liste déroulante : un adaptateur dans `shared/reference-data/` et `app-lazy-select` (sur `stp-select`).
7. Ajouter le préfixe d'API à `proxy.conf.js` et `nginx.conf`.
8. Mettre à jour [../rbac/](../rbac/README.md) et la documentation du domaine.

# Design System

> Conventions de design applicables à tout le frontend : jetons, thèmes clair et sombre, typographie, mouvement,
> thème de la librairie de composants. Complète `frontend.md` (section « Design System »), qui pose la règle générale :
> aucune valeur de design écrite en dur. Document générique — l'identité propre à un projet (couleur de marque, logo)
> est décrite dans la documentation du projet (`docs/frontend/`).

---

# Source unique : les jetons

Toute valeur de design (couleur, espacement, rayon, ombre, taille de texte, durée) est un **jeton** défini dans
`src/styles/_tokens.scss` et lu par `var(--…)`. Un composant n'écrit jamais d'hexadécimal, de `rgba()` de couleur,
d'ombre ou de durée en dur ; si un jeton manque, on l'ajoute — **avec sa valeur dans les deux thèmes**.

Les jetons forment trois couches :

| Couche | Rôle | Exemples |
|---|---|---|
| **Primitives** | L'échelle de couleurs de la marque ; identique dans les deux thèmes | `--brand-50` … `--brand-950` |
| **Sémantiques** | Ce que les composants utilisent ; redéfinies pour le thème sombre | `--color-surface`, `--color-text`, `--color-primary`, `--table-*`, `--chart-*`, `--shadow-*` |
| **Pont de la librairie** | Les variables que lit le thème de la librairie de composants | `--pn-surface-*`, `--pn-primary-*` |

Un composant utilise les jetons **sémantiques**, jamais une primitive (`--brand-*`) : c'est ce qui lui permet de suivre le thème.
Le bleu d'action (`--color-primary`) sert à l'action et à la position (bouton principal, lien, ligne active, focus) ;
les couleurs de statut (`--color-success`, `--color-warning`, `--color-danger`) ne se confondent jamais avec la marque.

---

# Thèmes clair et sombre

* Le thème est porté par l'attribut `data-theme="light|dark"` sur `<html>` ; **un seul** jeu de jetons par thème, redéfini
  sous `:root[data-theme='dark']` (et, sans attribut, sous `prefers-color-scheme: dark`).
* `ThemeService` (`core/theme/`) pilote l'attribut : tant que l'utilisateur n'a pas choisi, le thème suit son système ; son
  choix est mémorisé localement (`localStorage`, jamais envoyé au serveur). Le script d'`index.html` applique la même règle
  avant le premier affichage — pas de flash du mauvais thème.
* Un composant ne teste jamais le thème. S'il doit réagir à un changement (ex. un graphique qui lit ses couleurs une fois),
  il relit les jetons au changement de `ThemeService.theme()`.
* Un élément monochrome sombre (le logo) passe en blanc en thème sombre par un filtre CSS
  (`:host-context([data-theme='dark'])`), pas par un second fichier.
* Tout écran se vérifie dans **les deux thèmes** avant d'être livré.

---

# Thème de la librairie de composants

Le thème PrimeNG est **généré**, jamais modifié à la main : `npm run theme:generate` (`scripts/generate-primeng-theme.mjs`)
reprend le thème Aura de la librairie et remplace chaque couleur de marque ou de surface écrite en dur par une variable de
la couche « pont ». Le fichier produit (`src/styles/primeng-theme.css`) est versionné ; il se régénère après chaque
mise à jour de PrimeNG. Résultat : la couleur de marque et le thème sombre viennent **uniquement** des jetons, sans seconde
feuille ni bascule de fichier.

Limite connue : les couleurs de **statut** de la librairie (vert, rouge, orange, jaune, cyan, violet) restent celles d'Aura,
identiques dans les deux thèmes.

Un correctif de style d'un composant de la librairie se fait dans une feuille du projet (jamais dans le fichier généré),
avec `::ng-deep` borné par `:host` pour ne pas fuir hors du composant.

---

# Typographie

* **Une seule famille** de texte pour toute l'interface (`--font-sans`) et une famille à chasse fixe (`--font-mono`)
  réservée aux identifiants (codes, numéros de pièce, périodes) — classe utilitaire `.mono`.
* Les polices sont **embarquées dans l'application** (paquets `@fontsource/*`, déclarés dans `angular.json`) : jamais de CDN
  ni d'appel à un service externe, l'application doit fonctionner sans accès à Internet.
* Les **chiffres tabulaires** (`font-variant-numeric: tabular-nums`) sont obligatoires partout où l'on compare des montants
  (tableaux, tuiles de synthèse).
* Tailles : uniquement l'échelle des jetons (`--text-xs` à `--text-xl`).

---

# Mouvement

Le mouvement **explique un changement d'état** — un écran qui arrive, un thème qui change, une donnée qui charge, un appui —
et ne décore jamais un écran de travail. Tout est défini une seule fois dans `src/styles/_motion.scss`.

| Situation | Mouvement |
|---|---|
| Un écran apparaît | Fondu en montant de 6 px, `--duration-base` (220 ms) |
| Bascule de thème | Les couleurs glissent d'un thème à l'autre (classe `theme-transition` posée 300 ms par `ThemeService`, jamais au premier affichage) |
| Données en chargement | **Squelette** (`app-skeleton`) : la silhouette de ce qui arrive, qui respire doucement — jamais un « Chargement… » seul |
| Un appui sur un bouton | Il s'enfonce de 2 % (`--duration-fast`) |
| Survol (ligne de tableau, onglet, bouton) | Changement de fond ou de couleur en `--duration-fast`, sans déplacement |
| Menu en tiroir, panneaux, fenêtres | `--duration-base`, courbe `--ease-out`, jamais de rebond |
| Un graphique | Tracé de 600 ms, supprimé si l'utilisateur demande moins de mouvement |

* **Jetons** : `--duration-fast` (150 ms), `--duration-base` (220 ms), `--duration-slow` (400 ms, entrées en cascade),
  `--duration-slower` (700 ms, remplissage d'une jauge), `--ease-out` (la courbe de toute entrée), `--ease-in-out` (un
  balayage continu). Un composant n'écrit jamais une durée ni une courbe en dur.
* On n'anime que `opacity` et `transform` (et les couleurs) : jamais une propriété qui force une mise en page. Seule exception
  assumée : l'ouverture du menu latéral anime sa `width` — c'est un élément fixe superposé au contenu, aucune mise en page ne se
  recalcule autour de lui.
* **`prefers-reduced-motion`** : la feuille de mouvement neutralise toute animation et transition (durée quasi nulle) ; un
  mouvement propre à une bibliothèque (Chart.js) est coupé par le code (`mouvementReduit()`).

---

# Graphiques

Chart.js dessine dans un canvas et ne lit pas le CSS ; l'habillage est donc commun (`paie-chart-theme.ts`) et lit les jetons.

* **Une mesure, un axe.** Jamais deux échelles dans un même graphique (masse et bulletins ne sont pas comparables) : on
  propose un choix de mesure ou deux graphiques.
* **La couleur suit l'entité, jamais son rang** : une mesure a la même couleur dans tous les graphiques, quel que soit le
  filtre. Palette catégorielle `--chart-1…8` validée avec le validateur de la méthode (écart de vision des couleurs ≥ 8,
  plancher de vision normale ≥ 15) en clair **et** en sombre, dans un ordre fixe ; au-delà de trois séries on regroupe ou on
  sépare. Les couleurs de statut ne servent jamais de série.
* **Marques fines** : barres de 18 px au plus, bout arrondi de 4 px, ligne de 2 px, repères d'au moins 8 px cerclés de la
  couleur de la carte ; grille discrète, jamais de cadre ; pas de légende pour une série unique (le titre la nomme).
* **Thème** : un graphique dépend de `ThemeService.theme()` pour être redessiné à la bascule ; il lit police, textes, grille
  et infobulle dans les jetons.
* **Accessibilité** : un tableau de données déplié à la demande et un `aria-label` par graphique ; une infobulle au survol de
  toute la ligne ou de toute la colonne, pas seulement de la barre ; le texte n'a jamais la couleur de la série.

---

# Mise en page des écrans

La structure d'un écran de liste est définie **une seule fois**, dans la feuille globale `src/styles/_page.scss` (comme le style
des tableaux) : aucun écran ne redéfinit la carte, l'en-tête, les filtres ni la barre du tableau.

| Classe | Rôle |
|---|---|
| `app-page` | La carte de l'écran (fond, rayon, ombre, marge) |
| `app-page__header` | Le titre de l'écran (`<h1>`) |
| `app-toolbar` | Les filtres : une ligne de contrôles de même hauteur (`--control-height`), à plat sur la page ; deux par ligne sur téléphone. `app-toolbar__clear` : le bouton « Réinitialiser » à droite ; `app-toolbar__date` : un champ précédé d'un petit libellé (« Du », « Au ») |
| `app-table-bar` | Le total à gauche (`app-table-bar__total`), les outils à droite (`app-table-bar__tools`) |
| `app-table-bar` + `app-column-chooser.en-ligne` | Le choix des colonnes se pose toujours dans la barre du tableau |

Formulaires et consultations (`src/styles/_forms.scss`) :

| Classe | Rôle |
|---|---|
| `app-page--narrow` / `app-page--wide` | Largeur maximale de la carte (760 / 1000 px) |
| `app-back` | Le retour à la liste : un lien discret « ← Employés » au-dessus du titre, jamais un bouton |
| `app-page__actions` | Les actions de l'en-tête (consultation : Historique puis **Modifier**, l'action principale, en dernier) |
| `app-form__grid` (`--3`) | La grille de champs : 2 colonnes (ou 3), 1 sur téléphone ; `app-form__wide` pour un champ pleine largeur |
| `app-form__section` | Le titre d'un groupe de champs (ligne de séparation) — dès qu'un formulaire dépasse six champs |
| `field`, `field__req`, `field-error` | Un champ : libellé, contrôle, aide, erreur ; l'astérisque d'un champ obligatoire est rouge ; un champ invalide et touché a la bordure rouge |
| `app-form__actions` | Annuler (texte) puis l'action principale (à droite) ; collé au bas de l'écran sur téléphone |
| `app-detail` (`--3`) | Une consultation : étiquette en petites capitales, valeur, une ligne de séparation par information |

Fenêtres (`src/styles/_overlays.scss`) : toutes les fenêtres de dialogue ont le même rayon, les mêmes marges et un pied
séparé ; les **confirmations de suppression** sont étroites (30 rem), avec « Annuler » discret et « Supprimer » en rouge
(`--color-danger`) ; le sélecteur de fichier natif prend l'allure d'un bouton secondaire. Les textes des composants PrimeNG
(mois et jours du calendrier, messages vides) sont en français (`core/i18n/primeng-fr.ts`).

**Ordre des outils, du moins au plus important** : choix des colonnes (`app-column-chooser` avec la classe `en-ligne`), actions
secondaires (Exporter, Importer — bouton fractionné dont le menu porte le modèle de fichier, Synchroniser), puis l'**action
principale** en bleu plein, toujours en dernier (« Nouveau… »). Une seule action principale par écran.

---

# Responsive

Tout écran fonctionne du téléphone (390 px) au grand écran, **sans défilement horizontal de la page** : seul un tableau défile
horizontalement, à l'intérieur de sa carte.

* **Points de rupture** : jetons Sass dans `src/styles/_breakpoints.scss` (`phone` ≤ 767 px, `tablet-down` ≤ 1023 px,
  `compact-nav` pour la navigation en tiroir) ; une feuille de composant les utilise par `@use 'breakpoints' as bp;`
  puis `@include bp.phone { … }`. Jamais un `@media` à valeur écrite en dur dans un composant.
* **Navigation** : le menu latéral replié (bureau et tablette à souris) devient un **tiroir** ouvert par une barre du haut
  sur téléphone et tablette tactile — fond sombre cliquable, `Échap` et le choix d'un écran le referment.
* **Cibles tactiles** : sur écran tactile (`pointer: coarse`) ou téléphone, tout contrôle fait au moins 44 px
  (`--control-height`) et le texte d'un champ au moins 16 px (`--control-font-size`) — sinon iOS zoome à la saisie.
* **Grilles** : colonnes en `minmax(0, 1fr)` (jamais `1fr` seul : un contenu large étirerait la colonne), réduites à deux
  colonnes sur tablette et à une sur téléphone. Un élément pleine largeur se place par `grid-column: 1 / -1`
  (jamais `span n`, qui crée des colonnes implicites).
* **Tableaux** : la première colonne reste en vue pendant le défilement horizontal ; le paginateur se replie sur
  plusieurs lignes, sans « première / dernière page ».
* **Barres de filtres** : ce qui est secondaire se replie derrière un bouton « Filtres (n) » sur téléphone (le n compte les
  filtres actifs cachés) ; sur grand écran tout reste visible.
* **Dialogues** : plafonnés à la largeur de l'écran sur téléphone (`styles.scss`), quelle que soit la largeur donnée par l'écran.

---

# Accessibilité

Vérifiée automatiquement (axe-core, WCAG 2.1 A/AA et bonnes pratiques) dans les deux thèmes sur les écrans principaux : **aucune
violation** est la barre à tenir.

* **Contraste** : texte d'au moins 4,5:1 dans les deux thèmes (3:1 pour les grands textes et les contrôles). Les pastilles d'état
  (`p-tag`) tirent leurs couleurs des jetons de statut (`styles/_status.scss`), jamais du thème de la librairie ; un état n'est
  jamais porté par la seule couleur (la pastille dit « Actif », « Inactif »).
* **Noms accessibles** : tout bouton d'icône a un `aria-label` précis (« Modifier AABIDDI MOHAMED », pas « Modifier ») ; tout champ
  a un `<label for>` ou un `aria-label` (un champ de barre de filtres, qui n'a que son placeholder, porte `aria-label`) ; une
  colonne d'actions vide a un en-tête lu par les lecteurs d'écran (`app-lecteur`) ; un graphique a un `ariaLabel` et un tableau
  de données.
* **Clavier** : un lien d'évitement « Aller au contenu » en premier ; un anneau de focus unique (`:focus-visible`) sur tout élément
  interactif, jamais supprimé sans équivalent ; une zone qui défile (graphique, tableau) est atteignable au clavier
  (`tabindex="0"`, `role="region"`, libellé) ; le menu latéral ne s'ouvre au clavier que sur `:focus-visible`, pas après un clic.
* **Formulaires** : un message d'erreur est annoncé (`role="alert"`) ; une soumission refusée met le focus sur le premier champ
  invalide (`focaliserPremiereErreur`) ; quitter un formulaire modifié demande confirmation (`unsavedChangesGuard`, boîte
  « Quitter sans enregistrer ? ») et un formulaire enregistré est remis à l'état intact avant de naviguer ; les champs hors
  authentification ont `autocomplete="off"`, et `spellcheck="false"` quand ils portent un code (CIN, code, identifiant).
* **Langue et formats** : `lang="fr"`, locale `fr-FR` (nombres « 5 500,00 », dates), textes PrimeNG français ; les noms de marque
  portent `translate="no"` ; les points de suspension sont typographiques (`…`).
* **Tactile et écrans à encoche** : `touch-action: manipulation`, pas de halo de toucher, `overscroll-behavior: contain` sur les
  panneaux défilants, `viewport-fit=cover` et `env(safe-area-inset-*)` sur la barre du haut et le pied de formulaire.
* **Mouvement** : voir la section « Mouvement » ; `prefers-reduced-motion` est respecté.

---

# Principes

* Les jetons sont la source de vérité du style ; deux thèmes, un seul jeu de composants.
* Jamais de couleur en dur ; jamais de primitive dans un composant.
* Un jeton ajouté est défini dans les deux thèmes dans le même changement.
* Le thème de la librairie est généré ; on ne le modifie pas à la main.
* Polices embarquées, chiffres tabulaires pour les montants.
* Le mouvement sert la compréhension et respecte `prefers-reduced-motion`.

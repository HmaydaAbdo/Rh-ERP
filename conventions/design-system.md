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

* Durées et courbe par jetons (`--duration-fast`, `--duration-base`, `--ease-out`) ; transitions courtes (150–250 ms) sur le
  survol, l'ouverture d'un panneau, le changement de thème.
* Aucune animation décorative sur un écran de travail ; le mouvement explique un changement d'état.
* **`prefers-reduced-motion`** est respecté : la feuille globale neutralise les durées, et tout mouvement propre à un composant
  prévoit sa variante sans animation.

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

* Contraste de texte d'au moins 4,5:1 dans les deux thèmes (3:1 pour les grands textes et les contrôles).
* Un anneau de focus clavier unique (`:focus-visible`, couleur de marque) ; jamais supprimé sans équivalent.
* Un bouton qui ne porte qu'une icône a un libellé accessible (`aria-label`) ; une icône décorative est `aria-hidden`.

---

# Principes

* Les jetons sont la source de vérité du style ; deux thèmes, un seul jeu de composants.
* Jamais de couleur en dur ; jamais de primitive dans un composant.
* Un jeton ajouté est défini dans les deux thèmes dans le même changement.
* Le thème de la librairie est généré ; on ne le modifie pas à la main.
* Polices embarquées, chiffres tabulaires pour les montants.
* Le mouvement sert la compréhension et respecte `prefers-reduced-motion`.

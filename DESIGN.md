---
name: Staport RH
description: ERP RH, pointage et paie de Staport — espace de travail précis et accueillant, identité marine, accent minéral chaud, deux thèmes.
colors:
  brand-700: "#084478"
  brand-900: "#052a49"
  brand-300: "#82b2e0"
  primary: "#084478"
  primary-hover: "#06365f"
  primary-soft: "#e4eef9"
  primary-dark-theme: "#5b9be0"
  canvas: "#f3f4f1"
  surface: "#fffefa"
  border: "#d9e1df"
  text: "#0f2236"
  text-muted: "#5b6e85"
  success: "#15803d"
  warning: "#b45309"
  danger: "#b91c1c"
  canvas-dark: "#091521"
  surface-dark: "#111f30"
  border-dark: "#26394d"
  text-dark: "#e6eef8"
  sidebar: "#052a49"
  brand-accent: "#c88e5c"
typography:
  body:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  heading:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
  display:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "var(--text-display)"
    fontWeight: 600
  page-title:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "var(--text-page-title)"
    fontWeight: 600
  table-header:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.04em"
  identifier:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "16px"
  sidebar:
    backgroundColor: "{colors.sidebar}"
    width: "4.5rem, déployé à 15rem au survol ou au focus clavier"
  login:
    layout: "Formulaire unique centré dans une atmosphère marine, sans logo ni présentation des fonctions ; composition centrée sur toute largeur"
  workspace:
    layout: "Canevas ivoire minéral, surfaces cadrées, filtres regroupés, tables lisibles et repères chauds discrets dans les deux thèmes"
---

# Design System: Staport RH

## Overview

Un outil de travail quotidien (mode **Operate**) : RH et paie au bureau sur de longues tables, administrateurs de chantier,
direction en consultation. La marque est le **bleu marine Staport**, accompagné d'un accent minéral chaud pour quelques
repères. Sa personnalité passe par la composition, les détails précis et des surfaces calmes, jamais par une décoration
qui gêne le travail. Deux thèmes — clair et sombre —
partagent les mêmes composants ; seuls les jetons changent. Source de vérité : `frontend/src/styles/_tokens.scss` ;
règles : `conventions/design-system.md`.

## Colors

- **Primary (`#084478`)** : action et position — bouton principal, lien, onglet actif, focus. Contraste 10:1 sur blanc. En thème
  sombre il s'éclaircit (`#5b9be0`) pour rester lisible.
- **Neutres** : ivoire minéral et gris-bleu. Clair : `canvas #f3f4f1`, `surface #fffefa`, bordure
  `#d9e1df`, texte `#0f2236`, texte secondaire `#5b6e85`. Sombre : `canvas #091521`, `surface #111f30`, bordure `#26394d`,
  texte `#e6eef8`.
- **Accent minéral** (`#c88e5c`) : repère secondaire de navigation et détail de marque ; jamais une couleur de texte en petit corps.
- **Statut** (`success`, `warning`, `danger`) : ne se confond jamais avec la marque ; teintes plus claires en sombre.
- **Menu latéral** : bleu très foncé (`#052a49`) dans les deux thèmes, repère chaud discret sur l'écran actif.
- **Graphiques** : `--chart-1…8` (palette catégorielle validée en clair et en sombre) ; la couleur suit la mesure : masse = bleu `--chart-1`, bulletins = orange `--chart-2`, dans tous les graphiques.

## Typography

IBM Plex Sans pour tout le texte (400 / 500 / 600 / 700), IBM Plex Mono réservé aux identifiants (CIN, codes chantier,
périodes). Échelle `12 · 13 · 14 · 16 · 20 · 28 px`, plus `--text-page-title` pour les titres d'écran et `--text-display`
pour l'accroche d'accueil ; données des tableaux à 13 px, en-têtes à 12 px. **Chiffres tabulaires partout** où l'on compare des montants. En-têtes de
tableau en capitales, graisse 600, interlettrage 0,04 em. Polices embarquées (hors ligne).

## Layout

Coque : menu latéral réduit aux icônes (4,5 rem), sans bloc de marque ni espace réservé au logo ; chaque libellé est accessible en infobulle et au clavier. Le panneau se déploie à 15 rem au survol ou au focus clavier, puis se replie à la sortie. Sur téléphone et tablette, il reste un tiroir déclenché par la barre du haut. Les écrans d'authentification occupent tout le canevas même si une session est active. Connexion, récupération et réinitialisation utilisent la photographie locale `frontend/src/assets/auth/staport-login-atlas.png`, générée pour Staport RH, avec un voile sombre et une carte lisible. Le contenu métier s'appuie sur le canevas minéral avec un padding de 32 px : les listes respirent directement sur le canevas, tandis que les formulaires et consultations gardent une surface cadrée. Espacements par jetons (4 · 8 · 16 · 24 · 32 px). Le menu
devient un tiroir sur téléphone et tablette tactile ; les contenus et commandes s'adaptent aux largeurs compactes.

## Elevation & Depth

Plat par défaut : la hiérarchie vient des bordures et de l'alternance de fond. Ombres réservées aux couches flottantes : carte
(`--shadow-sm`), panneau et menu déployé (`--shadow-lg`). Plus sombres et plus denses en thème sombre.

## Shapes

Rayons 4 px (champs internes), 8 px (boutons, champs), 12 px (cartes de travail et d'accès). Les formes décoratives sont
limitées aux écrans d'entrée ; la forme de marque reste le monogramme « S » à pointe triangulaire (favicon uniquement).

## Components

- **Tableau** (`stp-table`) : lignes compactes, grille visible, alternance de lignes, survol, en-tête sur fond neutre ; un seul
  style pour tous les tableaux (`ui/table/table.component.scss`).
- **En-tête de page** : titre et onglets de vue soulignés sur une ligne, posés sur un filet ; l'onglet actif porte le trait de marque.
- **Barre de filtres** (Paie) : une seule ligne à plat de contrôles de même hauteur (`--control-height` 2,25 rem) — mois, nom,
  CIN, chantiers / équipes / fonctions en mode compact — toujours visibles ; fil de navigation dans les Cartes.
- **Écran de liste** (tous : Employés, Chantiers, Fonctions, Équipes, Utilisateurs, Rôles, Journal, Paie) : canevas ouvert (`app-page`),
  titre éditorial, bande de filtres (`app-toolbar`), barre du tableau (`app-table-bar`) puis tableau. Les formulaires et consultations sont cadrés.
- **Barre de tableau** : total à gauche ; à droite, du moins au plus important : colonnes, action secondaire (exporter, importer en
  bouton fractionné, synchroniser), action principale en bleu plein — toujours en dernier.
- **Bouton principal** : un seul par écran, bleu plein ; secondaires en contour, tertiaires en texte.
- **Formulaire** : lien « ← Liste », titre, grille de champs (libellé en gras, astérisque rouge, bordure rouge si invalide), sections
  pour les longs formulaires, pied « Annuler » + action principale à droite (collé en bas sur téléphone).
- **Consultation** : étiquette en petites capitales / valeur, une ligne de séparation par information ; Historique puis Modifier.
- **Fenêtre de dialogue** : rayon 12 px, marges 24 px, pied séparé ; confirmation de suppression étroite, « Supprimer » en rouge.
- **Accès** : formulaire centré sur la photographie Staport `frontend/src/assets/auth/staport-login-atlas.png`, assombrie pour le contraste ; sans logo ni liste des fonctions du produit. Les écrans de récupération et de réinitialisation gardent le même centrage et la même hiérarchie.

## Motion

Le mouvement explique un changement d'état : écran qui apparaît (fondu, 6 px, 220 ms), thème qui change (couleurs en fondu, 300 ms),
squelette de chargement, appui d'un bouton (2 %), tracé d'un graphique (600 ms). Durées et courbe par jetons (`--duration-*`,
`--ease-out`), `opacity` et `transform` seulement, aucun rebond ; `prefers-reduced-motion` supprime tout.

## Do's and Don'ts

- Toujours `var(--…)` ; jamais d'hexadécimal, d'ombre ou de rayon écrit en dur ; un jeton ajouté l'est dans les deux thèmes.
- Utiliser les jetons sémantiques (`--color-*`), jamais une primitive `--brand-*` dans un composant.
- Vérifier chaque écran dans les deux thèmes ; contraste ≥ 4,5:1 pour le texte.
- Ne pas décorer un écran de travail : pas de dégradé, pas d'animation qui n'explique pas un changement d'état.
- Un composant partagé vit dans `src/app/shared/ui/` (kit Staport) et se montre dans le catalogue (`/catalogue`).

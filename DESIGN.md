---
name: Staport RH
description: ERP RH, pointage et paie d'une entreprise marocaine de travaux publics — bleu marine du logo, deux thèmes, lisibilité avant expression.
colors:
  brand-700: "#084478"
  brand-900: "#052a49"
  brand-300: "#82b2e0"
  primary: "#084478"
  primary-hover: "#06365f"
  primary-soft: "#e4eef9"
  primary-dark-theme: "#5b9be0"
  canvas: "#f4f7fb"
  surface: "#ffffff"
  border: "#dce4ee"
  text: "#0f2236"
  text-muted: "#5b6e85"
  success: "#15803d"
  warning: "#b45309"
  danger: "#b91c1c"
  canvas-dark: "#0a1523"
  surface-dark: "#101f33"
  border-dark: "#24384f"
  text-dark: "#e6eef8"
  sidebar: "#052a49"
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
    width: "64px"
---

# Design System: Staport RH

## Overview

Un outil de travail quotidien (mode **Operate**) : RH et paie au bureau sur de longues tables, administrateurs de chantier,
direction en consultation. La marque est le **bleu marine du logo Staport** et ses variantes ; elle vit dans les détails précis
(repère de l'écran actif, bouton principal, focus, chiffres alignés), jamais dans la décoration. Deux thèmes — clair et sombre —
partagent les mêmes composants ; seuls les jetons changent. Source de vérité : `frontend/src/styles/_tokens.scss` ;
règles : `conventions/design-system.md`.

## Colors

- **Primary (`#084478`)** : action et position — bouton principal, lien, onglet actif, focus. Contraste 10:1 sur blanc. En thème
  sombre il s'éclaircit (`#5b9be0`) pour rester lisible.
- **Neutres** : gris-bleu de la teinte de la marque, jamais de gris pur. Clair : `canvas #f4f7fb`, `surface #fff`, bordure
  `#dce4ee`, texte `#0f2236`, texte secondaire `#5b6e85`. Sombre : `canvas #0a1523`, `surface #101f33`, bordure `#24384f`,
  texte `#e6eef8`.
- **Statut** (`success`, `warning`, `danger`) : ne se confond jamais avec la marque ; teintes plus claires en sombre.
- **Menu latéral** : bleu très foncé (`#052a49`) dans les deux thèmes, repère `brand-300` sur l'écran actif.
- **Graphiques** : `--chart-1…8`, bleu en tête puis ambre, sarcelle, violet, rouge ; versions éclaircies en sombre.

## Typography

IBM Plex Sans pour tout le texte (400 / 500 / 600 / 700), IBM Plex Mono réservé aux identifiants (CIN, codes chantier,
périodes). Échelle `12 · 13 · 14 · 16 · 20 · 28 px` ; tableaux denses à 12 px. **Chiffres tabulaires partout** où l'on compare
des montants. En-têtes de tableau en capitales, graisse 600, interlettrage 0,04 em. Polices embarquées (hors ligne).

## Layout

Coque : menu latéral replié de 64 px qui se déploie à 240 px au survol, contenu sur le canevas avec un padding de 32 px. Une page
de travail est une carte (`surface`, rayon 8 px, ombre légère) contenant le titre, la barre de filtres puis le tableau ou les
cartes. Espacements par jetons (4 · 8 · 16 · 24 · 32 px). *Responsive : à retravailler (phase dédiée) — le menu fixe de 64 px
et la barre de filtres débordent aujourd'hui sous 480 px.*

## Elevation & Depth

Plat par défaut : la hiérarchie vient des bordures et de l'alternance de fond. Ombres réservées aux couches flottantes : carte
(`--shadow-sm`), panneau et menu déployé (`--shadow-lg`). Plus sombres et plus denses en thème sombre.

## Shapes

Rayons 4 px (champs internes), 8 px (cartes, boutons, champs), 12 px (carte de connexion). Pas de formes décoratives ; la seule
forme de marque est le monogramme « S » à pointe triangulaire (favicon, menu).

## Components

- **Tableau** (`app-table`) : lignes compactes, grille visible, alternance de lignes, survol, en-tête sur fond neutre ; un seul
  style pour tous les tableaux (`_tables.scss`).
- **En-tête de page** : titre et onglets de vue soulignés sur une ligne, posés sur un filet ; l'onglet actif porte le trait de marque.
- **Barre de filtres** (Paie) : une seule ligne à plat de contrôles de même hauteur (`--control-height` 2,25 rem) — mois, nom,
  CIN, chantiers / équipes / fonctions en mode compact — toujours visibles ; fil de navigation dans les Cartes.
- **Barre de tableau** : total à gauche ; à droite, du moins au plus important : colonnes, exporter, importer (bouton fractionné),
  action principale en bleu plein.
- **Bouton principal** : un seul par écran, bleu plein ; secondaires en contour, tertiaires en texte.
- **Connexion** : carte sur fond bleu profond à courbes de niveau, logo officiel (blanc en sombre).

## Do's and Don'ts

- Toujours `var(--…)` ; jamais d'hexadécimal, d'ombre ou de rayon écrit en dur ; un jeton ajouté l'est dans les deux thèmes.
- Utiliser les jetons sémantiques (`--color-*`), jamais une primitive `--brand-*` dans un composant.
- Vérifier chaque écran dans les deux thèmes ; contraste ≥ 4,5:1 pour le texte.
- Ne pas décorer un écran de travail : pas de dégradé, pas d'animation qui n'explique pas un changement d'état.
- Ne pas modifier `primeng-theme.css` à la main : il est généré (`npm run theme:generate`).

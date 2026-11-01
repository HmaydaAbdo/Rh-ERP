---
name: Staport ERP
description: Console de travail dense et nette pour la paie, les employés et les chantiers d'une entreprise du BTP marocaine.
colors:
  action-light: "#1E40AF"
  action-dark: "#ECEAE3"
  canvas-light: "#F3F4F6"
  surface-light: "#FFFFFF"
  text-light: "#111827"
  border-strong-light: "#7F8796"
  canvas-dark: "#1F1E1D"
  surface-dark: "#2B2A28"
  text-dark: "#F5F4EF"
  border-strong-dark: "#8A877F"
  success-dark: "#9BE3B8"
  warning-dark: "#FAD58F"
  danger-dark: "#FFB4AD"
  chart-1: "#3987E5"
  chart-2: "#D95926"
  chart-3: "#199E70"
  chart-4: "#C98500"
  chart-5: "#D55181"
typography:
  display:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "3.5rem"
    fontWeight: 600
  title:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.15
  headline:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
  body:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.action-light}"
    textColor: "{colors.surface-light}"
    rounded: "{rounded.md}"
    height: "40px"
  button-secondary:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.action-light}"
    rounded: "{rounded.md}"
    height: "40px"
  card:
    backgroundColor: "{colors.surface-light}"
    rounded: "{rounded.md}"
    padding: "16px"
  table-row:
    height: "48px"
---

# Design System: Staport ERP

## Overview

**Creative North Star : « La salle de contrôle claire ».** Une application de travail qu'on utilise huit heures par jour : les données
d'abord, du calme autour, aucune décoration. Le standard visé est celui des meilleurs outils de la catégorie (Linear, Stripe, Notion) :
densité lisible, bordures franches, texte toujours visible, aucun effet qui ne serve un état.

Mode **Operate** : la lisibilité, la cohérence et la rapidité d'accès passent avant l'expression. Deux thèmes complets, **sombre par
défaut** (gris chauds neutres, sans bleu, action blanc cassé), clair avec une action bleue `#1E40AF`. Chaque couple de couleurs est
mesuré par script (`npm run check:contraste`) : texte courant 7:1, texte secondaire et actions 4,5:1, bordures franches et éléments
graphiques 3:1. Interface en français, prête à être lue de droite à gauche (propriétés logiques partout).

Vocabulaire métier : parler de paie, c'est parler de **bulletins de paie, un par employé et par mois**.

## Colors

Jetons sémantiques uniquement (`--color-*`), jamais de valeur brute dans un écran.

- **Action** : `#1E40AF` en clair, `#ECEAE3` en sombre (texte foncé dessus). Une seule couleur d'action ; le lien reste souligné.
- **Neutres** : toile, surface, surface alternée, surface creusée ; texte et texte secondaire. En sombre, des gris chauds, jamais bleutés.
- **Bordures franches** : `--color-border-strong`, au moins 3:1 sur la surface, notamment autour des tableaux et des contrôles.
- **États** : succès, alerte, danger, information, en texte sur fond teinté ; jamais confondus avec l'action.
- **Graphiques** : huit séries (`--chart-1…8`) à 3:1 minimum sur la surface dans les deux thèmes.

## Typography

**Inter Variable**, embarquée (aucun CDN), chiffres tabulaires (`tnum`) pour les montants et les dates. Corps 15 px, interligne 1,5 ;
titres en graisse 600. Échelle : 12 / 14 / 15 / 16 / 20 / 28 px, titre de page fluide de 24 à 30 px. Les libellés d'en-tête de tableau
ne sont jamais tronqués ; aucun capitales espacées.

## Layout

Un écran est une **colonne de sections pleine largeur** séparées par un seul écart, `--space-lg` (24 px) : aucun écran ne pose de marge
de section (`npm run check:espacement`, garde de rythme dans les tests de rendu). Bords de début et de fin communs ; un `.app-page`
imbriqué n'ajoute ni retrait ni écart. En-tête de page : bouton hamburger, titre à gauche, onglets de vue au centre, actions à droite.
Grilles de cartes `auto-fit` à partir de 20 rem. Contrôles de 40 px (44 px au toucher), lignes de tableau de 48 px.
**Navigation unifiée** : un seul panneau (barre Staport) ouvert par le bouton hamburger de l'en-tête ; plus de rail ni de lanceur flottant.

## Elevation & Depth

Surtout plat : la profondeur vient des bordures franches et des surfaces, pas des ombres. Trois ombres (`--shadow-sm|md|lg`),
réservées aux couches flottantes (panneau de navigation, listes déroulantes, dialogues). Aucun verre dépoli, aucun halo.

## Shapes

Rayons de 4 à 16 px (`--radius-sm|md|lg|xl`), 8 px par défaut pour contrôles et cartes. Cadres à bordure franche d'un pixel ; aucun
liseré latéral coloré sur une carte, une notification ou une alerte (une bordure complète et une icône).

## Components

Tous les composants visuels vivent dans `shared/ui/` (contrôle `npm run check:composants`) ; un écran de domaine les compose et n'a
aucun style propre.

- **Boutons** : primaire (action pleine), secondaire (bordure franche), texte, danger ; icône seule avec nom accessible.
- **Tableaux** : AG Grid Community habillé par les jetons, tri, recherche, colonnes réordonnables, pagination serveur ; jamais de
  tableau HTML natif.
- **Graphiques** : `ng2-charts` ; plusieurs indicateurs dans un seul graphique, un axe par unité (deux au plus).
- **Cartes** (`app-entity`) : titre, indicateurs avec écart en unité et en pourcentage, pied à actions nommées.
- **Barre Staport** (`stp-dock`) : commandes directes (Accueil, AI, thème) et destinations autorisées, ouverte à côté du hamburger.
- **Carte des chantiers** : plan clair ou sombre selon le thème, plein écran ; le satellite garde son imagerie.

## Do's and Don'ts

**À faire**
- Composer à partir de `shared/ui/` et des feuilles de `styles/` ; ajouter un composant partagé plutôt qu'un style local.
- Utiliser les jetons et les propriétés logiques (`margin-inline-start`, `inset-inline-end`, `text-align: start|end`).
- Dire les nombres de paie en bulletins ; montrer chaque variation en unité et en pourcentage.
- Vérifier chaque écran dans les deux thèmes, sur ordinateur et téléphone.

**À éviter**
- Marges de section, cartes dans des cartes, effets décoratifs, dégradés de texte, animations qui ne signalent aucun état.
- Valeurs de couleur brutes, `left`/`right` en dur, tableaux HTML natifs, export fabriqué dans le navigateur.
- Réintroduire un rail ou un lanceur flottant : la navigation est unifiée.

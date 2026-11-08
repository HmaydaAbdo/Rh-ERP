---
title: "Composants visuels hors `shared/ui/` (E0.2, terminé le 2026-11-01)"
sidebar_position: 2
---

Mesure du 2026-10-31 par `npm run check:composants` (script `scripts/check-composants-partages.mjs`). Règle du propriétaire : tout écran
est composé de composants de `shared/ui/` ; aucun composant visuel ne vit dans un dossier de domaine.

**Règle mesurée.** Un composant est en infraction s'il se trouve hors de `frontend/src/app/shared/ui/` et soit porte ses propres styles
(`styleUrl`, `styleUrls` ou `styles`), soit vit dans un dossier partagé autre que `shared/ui/`. Un écran de domaine qui n'assemble que
des composants partagés et des classes globales (`app-page`, `app-toolbar`, `app-form__grid`…, définies dans `src/styles/`) est conforme.

**Contrôle en cliquet.** `scripts/composants-hors-ui.baseline.json` liste les infractions héritées. Le contrôle échoue si une infraction
nouvelle apparaît, ou si une infraction listée a disparu sans avoir été retirée de la liste (`npm run check:composants -- --ecrire-baseline`).
La liste ne fait que diminuer et doit être **vide à la fin d'E0.7**.

## État de départ

| Zone | Composants | Avec styles propres | Lignes de style |
|---|---|---|---|
| `shared/ui/` | 16 | — (conforme par définition) | — |
| `shared/components/` et `shared/feedback/` | 8 | 8 hors `shared/ui/` | — |
| `core/` (coquille, authentification, assistant) | 12 | 10 | 734 (le fichier d'authentification n'est compté qu'une fois) |
| `portail/` (domaines) | 70 | 33 | 3 420 |
| **Infractions** | **51** sur 106 composants | | |

## Familles et composant partagé cible

| Famille | Composants concernés | Lignes de style | Composant partagé à ajouter ou étendre |
|---|---|---|---|
| Rangement des dossiers partagés | `shared/components/*` (7), `shared/feedback` | — | Déplacement vers `shared/ui/` (mécanique) |
| Authentification | `login`, `forgot-password`, `reset-password` (un seul fichier de 329 lignes partagé par référence), `access-denied` (58) | 387 | `auth-card` — **fait** (E0.2, 2026-10-31) ; `access-denied` reste à traiter |
| Coquille d'application | `app.component` (rail, barre du haut, tiroir) | 357 | `app-shell` — **fait** (E0.2, 2026-10-31) |
| Tableaux de bord | `perimetre/analytique`, `perimetre/cartes`, `paie/cartes`, `paie/parcours` | 1 035 | `stat-tile`, `chart-card`, `dashboard-section` |
| Assistants d'import et d'export | `paie/export` (7 composants), `paie/import` (2), `heures-supp/import` | 980 | `stepper`, `file-drop`, `summary-list` |
| Carte des chantiers | `chantier/carte` (2) | 356 | `map` |
| Filtres, détails, journaux | `paie/filtres`, `employee/details`, `admin/*`, `audit/*` | ~700 | `filter-bar`, `detail-list`, `timeline` |
| Assistant IA | `core/assistant/*` (8) | ~350 | `chat-*` (reprise avec E12) |

## Ordre de résorption proposé

1. Rangement des dossiers partagés (aucun changement visuel).
2. Authentification (`stp-auth-card` : fait ; reste `access-denied`).
3. Coquille d'application (`stp-app-shell` : fait).
4. Tableaux de bord, assistants d'import et d'export, filtres et détails.
5. Carte et assistant IA (avec E0.7 et E12).

Chaque lot : composants ajoutés à `shared/ui/` et montrés dans le catalogue (`/catalogue`, E0.3), vérification des deux thèmes sur
ordinateur et téléphone, tests, liste de référence mise à jour dans le même commit.

## Résultat

**Zéro infraction** : `npm run check:composants` passe sans liste de référence (`scripts/composants-hors-ui.baseline.json` est vide), donc
toute infraction nouvelle fait échouer le contrôle de la CI. De 51 infractions au départ, elles ont été résorbées ainsi :

| Famille | Remplacée par |
|---|---|
| Dossiers `shared/components`, `shared/feedback` | Déplacés dans `shared/ui/` |
| Authentification | `stp-auth-card`, classes `app-form` et `app-link` |
| Coquille d'application | `stp-app-shell` |
| Assistants d'import et d'export | `stp-stepper`, `stp-wizard-state`, `styles/_wizard.scss` |
| Tableaux de bord, cartes, fil d'étapes | `styles/_dashboard.scss` (`app-trail`, `app-kpi`, `app-panel`, `app-chart`, `app-entity`, `app-person`, `app-level`) |
| Fiches, administration, audit, réglages | `styles/_content.scss`, `styles/_forms.scss` (`app-profile`, `app-facts`, `app-setting`, `app-group`, `app-check`, `app-columns`, `app-timeline`) |
| Filtres de la paie | `styles/_page.scss` (`app-toolbar__period`, `__search`, `__toggle`, `__secondary`) |
| Assistant IA | classes `app-ask`, `app-choice-btn`, `app-datagrid`, tuiles et panneaux du tableau de bord |
| Carte des chantiers | `styles/_map.scss` (`app-map`, `app-map-page`) |

Les feuilles `styles/*.scss` sont le vocabulaire partagé du système de design : un écran de domaine les compose, il ne les redéfinit pas.

**Exports supprimés** (décision du 2026-11-01) : le bouton d'export PDF par composant, `PdfImpressionService` et l'export CSV du tableau de
l'assistant sont retirés ; seuls les exports produits par le backend subsistent, dont le rapport de paie.

## Galerie

La page `/catalogue` (développement) montre chaque composant de `shared/ui/` puis le vocabulaire des feuilles `src/styles/` (assistant en
étapes, tableau de bord, cartes, fiche, réglages, droits, barre de filtres), dans les deux thèmes. Elle est contrôlée par axe (aucune
violation, clair et sombre). Les captures de référence — clair et sombre, ordinateur et téléphone — sont dans `docs/frontend/references/` ;
`npm run e2e:references` (depuis `frontend/`, avec `E2E_PORT` pointant vers un serveur de développement) les régénère.

# Contrôle du design system — 2026-10-13

## Périmètre et statut

Revue du code courant (`30c59c8`) contre [`conventions/design-system.md`](../../conventions/design-system.md), du catalogue partagé, des tests E2E et de la documentation frontend. Après l'audit initial, les corrections mécaniques listées ci-dessous ont été appliquées. Les vérifications visuelles manuelles, notamment en contraste forcé, restent à faire ; ce document ne déclare donc pas la convention conforme.

**Statut : partiel.** Le socle de thèmes et plusieurs contrôles automatisés existent. Les preuves ne couvrent pas encore tous les composants, leurs états et les vérifications manuelles requises.

## Avancement de cette passe

- Remplacement de trois usages de primitives neutres par leurs jetons sémantiques et centralisation des deux ruptures `48rem`.
- Ajout au catalogue des démonstrations d'erreur de champ, nombre, date, mois, mot de passe, message, icône et graphique.
- Ajout d'une navigation clavier dans `stp-chart` : flèches, Début/Fin, Entrée/Espace et annonce du point sélectionné ; ajout d'un scénario E2E ciblé.
- Les utilitaires Tailwind compilés (`bg-surface`, `text-muted`, `rounded-md`, `shadow-md`, `text-page-title`) pointent vers les variables sémantiques du thème ; aucun jeu de valeurs concurrent n'est généré.
- `ngc --noEmit -p tsconfig.app.json` réussit et les cinq feuilles Sass concernées compilent avec l'API JS Sass.
- Le build Angular et le test Angular ciblé n'ont pas abouti : Sass Embedded échoue à canonicaliser/lire `node_modules/sass-embedded-win32-x64/dart-sass/src/sass.snapshot` (OS error 5). Le test ciblé a été interrompu après répétition de la même erreur.

## Éléments déjà présents

- `frontend/src/styles/_tokens.scss` centralise les couleurs, espacements, rayons, ombres, typographie, mouvement et jetons de tableaux ; le thème sombre redéfinit les valeurs sémantiques à partir des primitives du thème.
- `ThemeService` suit la préférence système, mémorise le choix utilisateur localement et pose `data-theme`. Le script de `index.html` pose le thème avant le premier rendu.
- Les polices IBM Plex sont embarquées depuis `@fontsource`; le mouvement réduit est traité dans `_motion.scss`; `_accessibility.scss` contient des règles `forced-colors`.
- Le catalogue `/catalogue` et ses parcours Playwright couvrent déjà des composants en clair/sombre avec axe, ainsi que des interactions clavier pour le sélecteur, le dialogue et le tableau.
- Des contrôles responsive existent pour la navigation mobile, le débordement horizontal et la taille tactile.

## Écarts constatés

### 1. Catalogue et états incomplets

À l'audit initial, le catalogue ne présentait pas comme démonstrations dédiées les composants d'erreur de champ, mot de passe, mois, date, nombre, icône, message et graphique. Ces huit démonstrations ont été ajoutées dans cette passe. Leurs états applicables et les scénarios d'accessibilité restent à examiner ; la présence d'une démo ne constitue pas à elle seule une preuve de conformité de tous les états.

Le test axe du catalogue ne contrôle que son contenu actuellement rendu, dans les thèmes clair et sombre. Les tests clavier couvrent des parcours ciblés, pas tous les composants et états documentés par la convention.

### 2. Contraste forcé : règles présentes, preuve visuelle manquante

Les styles `forced-colors` sont définis globalement et sur l'écran de connexion. La suite E2E d'authentification vérifie que le navigateur émule ce mode, mais ne vérifie pas la lisibilité de l'ensemble du kit dans ce mode. Aucun relevé de contrôle manuel au contraste élevé/clavier n'est référencé dans la matrice.

### 3. Source des jetons Tailwind

`frontend/src/styles/tailwind.css` relie maintenant les noms d'utilitaires aux variables sémantiques de `_tokens.scss` via `@theme inline`. La compilation PostCSS ciblée confirme que les utilitaires vérifiés émettent ces variables (`bg-surface` → `--color-surface`, `text-muted` → `--color-text-muted`, `rounded-md` → `--radius-md`, etc.). La compilation Angular complète reste bloquée par l'erreur Sass Embedded décrite plus haut.

Les usages directs de `--neutral-*` dans `select.component.scss`, `password-input.component.ts` et `materiel-etape.component.scss` ont été remplacés par `--color-surface-alt` ou `--color-surface`.

### 4. Exceptions de valeurs et mouvement à inventorier

- Les ruptures de `48rem` de `parametre-item.component.scss` et `user-form.component.scss` sont maintenant centralisées dans le mixin `form-compact` de `_breakpoints.scss`.
- Les vues Cartes et Analytique ont des animations d'entrée locales de 14 px, distinctes de l'entrée d'écran définie dans `_motion.scss` (6 px). Les animations et délais locaux doivent être comparés à la règle de mouvement centrale.
- Des détails visuels ponctuels (dimensions, traits et espacements en pixels) apparaissent encore dans des styles de composants. Ils doivent être triés entre valeurs de design à tokeniser et mesures purement géométriques nécessaires au rendu.

### 5. Graphique : preuve d'interaction clavier à exécuter

`stp-chart` expose désormais une interaction clavier : flèches gauche/droite ou haut/bas parcourent les points, Début/Fin vont au premier/dernier, et Entrée/Espace émettent `dataSelect`. Le point courant est annoncé par une région live. Un scénario E2E couvre cette interaction ; il n'a pas encore pu être exécuté dans cette session à cause de l'erreur Sass Embedded. La vérification avec une technologie d'assistance reste également à faire.

### 6. Inventaire documentaire absent

`docs/frontend/README.md` documente les principaux patterns, mais il n'y a pas de registre complet des composants partagés avec variantes, états, clavier/ARIA, thèmes et preuve de test. C'est le principal suivi demandé par la matrice actuelle.

## Suite proposée

1. Étendre les preuves axe et clavier aux états et composants du catalogue, puis vérifier manuellement les thèmes clair/sombre et le contraste forcé.
2. Produire l'inventaire complet des composants, jetons et exceptions de styles, puis corriger les mouvements locaux clairement hors convention.
3. Exécuter le scénario E2E du graphique et valider son fonctionnement avec technologie d'assistance.
4. Relancer build et test ciblé quand Sass Embedded peut lire son snapshot ; exécuter ensuite les contrôles frontend prévus par la convention.
5. Mettre à jour la documentation du kit et cette matrice avec les preuves reproductibles ; garder le statut partiel jusqu'à clôture des contrôles automatisés et manuels.

Les points 1 à 4 touchent au langage visuel partagé. Toute modification qui change les couleurs, les thèmes ou l'API globale du kit doit être instruite avant implémentation conformément à la règle de décision d'architecture du projet.

# Contrôle du design system — 2026-10-13

## Périmètre et statut

Revue du code courant (`f5ef1cc`) contre [`conventions/design-system.md`](../../conventions/design-system.md), du catalogue partagé, des tests E2E et de la documentation frontend. Les corrections décrites ci-dessous sont locales et ne sont pas encore intégrées ni validées par une nouvelle CI. Les vérifications visuelles manuelles, notamment en contraste forcé, restent à faire ; ce document ne déclare donc pas la convention conforme.

**Statut : partiel.** Le socle de thèmes et plusieurs contrôles automatisés existent. Les preuves ne couvrent pas encore tous les composants, leurs états et les vérifications manuelles requises.

## Avancement de cette passe

- Remplacement de trois usages de primitives neutres par leurs jetons sémantiques et centralisation des ruptures responsive dans `_breakpoints.scss`, y compris la règle tactile globale.
- Ajout au catalogue des démonstrations d'erreur de champ, nombre, date, mois, mot de passe, message, icône et graphique.
- Ajout d'une navigation clavier dans `stp-chart` : flèches, Début/Fin, Entrée/Espace et annonce du point sélectionné ; ajout d'un scénario E2E ciblé.
- Les utilitaires Tailwind compilés (`bg-surface`, `text-muted`, `rounded-md`, `shadow-md`, `text-page-title`) pointent vers les variables sémantiques du thème ; aucun jeu de valeurs concurrent n'est généré.
- Les keyframes sont centralisés dans `_motion.scss`. Les entrées redondantes des cartes et tuiles Paie ont été retirées ; les règles de mouvement réduit restent centralisées. Le squelette respire par opacité, et la confirmation de l'export utilise uniquement opacité/transform.
- Les jetons `--space-2xs`, `--space-sm-md`, `--radius-xl`, `--radius-pill`, `--radius-badge` et `--focus-offset` couvrent plusieurs valeurs auparavant écrites dans les feuilles ; la référence inexistante `--radius-2xs` a été supprimée.
- `ngc --noEmit -p tsconfig.app.json` et `npx tsc --noEmit -p tsconfig.spec.json` réussissent. Les feuilles Sass modifiées compilent avec l'API JS Sass.
- Le build Angular et le test ciblé ne démarrent pas : Sass Embedded échoue à canonicaliser/lire `node_modules/sass-embedded-win32-x64/dart-sass/src/sass.snapshot` (OS error 5). Cette limitation locale n'est pas une réussite de build/test.
- La CI GitHub Actions du commit `f5ef1cc`, run [38447235345](https://github.com/HmaydaAbdo/Rh-ERP/actions/runs/38447235345), a compilé puis échoué dans un test unitaire du graphique : le test attendait l'ancien nom accessible sans l'aide clavier ajoutée au canvas. L'attendu a été corrigé localement ; une CI relancée reste nécessaire.

## Éléments déjà présents

- `frontend/src/styles/_tokens.scss` centralise les couleurs, espacements, rayons, ombres, typographie, mouvement et jetons de tableaux ; le thème sombre redéfinit les valeurs sémantiques à partir des primitives du thème.
- `ThemeService` suit la préférence système, mémorise le choix utilisateur localement et pose `data-theme`. Le script de `index.html` pose le thème avant le premier rendu.
- Les polices IBM Plex sont embarquées depuis `@fontsource`; le mouvement réduit est traité dans `_motion.scss`; `_accessibility.scss` contient des règles `forced-colors`.
- Le catalogue `/catalogue` et ses parcours Playwright couvrent déjà des composants en clair/sombre avec axe, ainsi que des interactions clavier pour le sélecteur, le dialogue et le tableau.
- Des contrôles responsive existent pour la navigation mobile, le débordement horizontal et la taille tactile.

## Écarts constatés

### 1. Catalogue et états incomplets

Le catalogue présente maintenant des démonstrations dédiées pour l'erreur de champ, le mot de passe, le mois, la date, le nombre, l'icône, le message et le graphique. `docs/frontend/README.md` inventorie les 15 composants partagés ; les tests unitaires ont aussi un fichier de spec pour chacun. Il manque encore une correspondance explicite entre les états applicables, les interactions testées et les états non atteignables dans le catalogue. La présence d'une démo ou d'un fichier de spec ne prouve pas à elle seule que tous les états sont conformes.

Le test axe du catalogue ne contrôle que son contenu actuellement rendu, dans les thèmes clair et sombre. Les tests clavier couvrent des parcours ciblés, pas tous les composants et états documentés par la convention.

### 2. Contraste forcé : règles présentes, preuve visuelle manquante

Les styles `forced-colors` sont définis globalement et sur l'écran de connexion. La suite E2E d'authentification vérifie que le navigateur émule ce mode, mais ne vérifie pas la lisibilité de l'ensemble du kit dans ce mode. Aucun relevé de contrôle manuel au contraste élevé/clavier n'est référencé dans la matrice.

### 3. Source des jetons Tailwind

`frontend/src/styles/tailwind.css` relie maintenant les noms d'utilitaires aux variables sémantiques de `_tokens.scss` via `@theme inline`. La compilation PostCSS ciblée confirme que les utilitaires vérifiés émettent ces variables (`bg-surface` → `--color-surface`, `text-muted` → `--color-text-muted`, `rounded-md` → `--radius-md`, etc.). La compilation Angular complète reste bloquée par l'erreur Sass Embedded décrite plus haut.

Les usages directs de `--neutral-*` dans `select.component.scss`, `password-input.component.ts` et `materiel-etape.component.scss` ont été remplacés par `--color-surface-alt` ou `--color-surface`.

### 4. Exceptions de valeurs et mouvement

- Les ruptures de `48rem` de `parametre-item.component.scss` et `user-form.component.scss` sont maintenant centralisées dans le mixin `form-compact` de `_breakpoints.scss`.
- Les animations d'entrée redondantes des cartes et tuiles ont été supprimées ; les keyframes restantes sont dans `_motion.scss`. Le seul changement de mise en page animé est la largeur du menu latéral, exception explicitement prévue par la convention.
- Le scan trouve encore des dimensions et mesures géométriques locales (icônes, poignées, hauteurs de panneau, largeur de tableaux, etc.). Elles restent à distinguer des valeurs d'espacement/rayon/typographie qui doivent utiliser ou ajouter un jeton ; le scan n'est donc pas déclaré clos.

### 5. Graphique : preuve d'interaction clavier à exécuter

`stp-chart` expose désormais une interaction clavier : flèches gauche/droite ou haut/bas parcourent les points, Début/Fin vont au premier/dernier, et Entrée/Espace émettent `dataSelect`. Le point courant est annoncé par une région live. Le test unitaire vérifie le nom accessible corrigé ; un scénario E2E couvre le clavier mais reste à exécuter après correction de l'environnement Sass. La vérification avec une technologie d'assistance reste également à faire.

### 6. Matrice de couverture des composants à compléter

`docs/frontend/README.md` contient déjà un inventaire des 15 composants avec leur rôle et leur primitive. Il ne relie pas encore chaque composant à ses états, à son spec, aux parcours E2E pertinents et aux vérifications manuelles clair/sombre/contraste forcé. Le rapport de conformité doit faire ce lien avant de considérer l'audit documentaire fini.

## Suite proposée

1. Compléter la matrice composants → états → tests unitaires/E2E → thèmes et contraste forcé.
2. Relancer build, test ciblé et E2E après intégration du correctif du test CI ; résoudre l'accès local à Sass Embedded si le problème persiste.
3. Exécuter le scénario E2E du graphique et vérifier au clavier et avec une technologie d'assistance.
4. Démarrer l'application via Docker Compose, puis vérifier manuellement clair/sombre, contraste forcé, focus/clavier et rendu responsive.
5. Finir le tri des dimensions et espacements locaux, mettre à jour les preuves et seulement alors réévaluer le statut.

Les points 1 à 4 touchent au langage visuel partagé. Toute modification qui change les couleurs, les thèmes ou l'API globale du kit doit être instruite avant implémentation conformément à la règle de décision d'architecture du projet.

# Contrôle du Design System — 2026-10-13

## Périmètre et statut

Contrôle du kit partagé et des principaux écrans de l’application, selon [`conventions/design-system.md`](../../conventions/design-system.md), dans l’image Compose accessible sur `http://127.0.0.1:5002`.

**Statut : contrôles locaux terminés, validation CI/runtime de la version finale en attente (2026-10-14).** La CI et l’image du commit `006f777` sont validées ; l’instance Compose répond sur `http://127.0.0.1:5002` et sert le jeton `--space-2xl`. Le parcours navigateur antérieur couvre les 11 routes principales en responsive, thèmes clair/sombre et contraste forcé. L’utilisateur a confirmé au Narrateur les sélecteurs multiples, le dialogue, le tableau et, sur la dernière version, le nouveau nom accessible et le tableau de données du graphique. `stp-chart` traite les couleurs système pour les graphiques cartésiens et radiaux, y compris les bascules à chaud. L’inspection locale du Catalogue couvre les variantes du kit et les états ouverts du multisélect, du dialogue, du tableau et du graphique en contraste forcé. Les 669 tests frontend, les 9 E2E Catalogue et le build de production local passent. Le build a nécessité le mode CI (`CI=true`, `NG_BUILD_MAX_WORKERS=2`) pour contourner une sortie silencieuse du build local standard. Il reste à faire passer cette version par la CI, puis vérifier son image sur Compose avant de clore et supprimer ce rapport.

## Preuves d’exécution

### CI et image

Le [run GitHub Actions 38463587093](https://github.com/HmaydaAbdo/Rh-ERP/actions/runs/38463587093), sur `006f777` (tentative 2), est terminé avec succès : les cinq jobs `postgres`, `frontend`, `backend`, `full-stack` et `backup` sont verts. Les tests frontend, le build de production, les E2E, les tests backend et la construction/publication des images passent. La tentative 1 avait reçu un `HTTP 429` de Maven Central pendant la construction de l’image backend ; la relance ciblée du job backend a réussi.

Après les derniers changements de `stp-chart`, la vérification locale finale est verte : `npm test` (96 fichiers, 669 tests), `npx playwright test e2e/catalogue.spec.ts --workers=1 --timeout=60000` (9/9), `npx tsc --noEmit -p tsconfig.app.json`, et `CI=true NG_BUILD_MAX_WORKERS=2 npx ng build --configuration production` (build réussi, bundle initial 630,50 Ko). La CI et l’image publiées de cette révision locale restent à valider par le propriétaire après commit/push.

Sur l’instance Compose `http://127.0.0.1:5002`, la feuille chargée définit `--space-2xl: 4rem`, ce qui confirme le bundle frontend mis à jour. La connexion et les requêtes API fonctionnent après authentification. Une seule erreur `401` a été observée au premier rafraîchissement avant la connexion ; elle ne se reproduit pas ensuite. Aucun avertissement navigateur n’a été relevé.

### Contrôle navigateur de l’application

Connexion réussie à l’instance locale. Les routes Paie tabulaire/cartes/analytique, Employés, Chantiers, Fonctions, Équipes, Utilisateurs, Rôles, Paramètres et Journal d’audit ont été parcourus. L’instance contient 17 équipes, un utilisateur, deux rôles et des entrées d’audit ; Paie, Employés, Chantiers et Fonctions sont vides et affichent leurs états vides attendus. L’analytique Paie indique clairement qu’aucun bulletin n’est à analyser.

À 390 px, les 11 routes principales ont été parcourues ; aucune n’a de débordement horizontal de page. Le débordement des tableaux reste dans leur conteneur défilant.

En thème sombre avec `forced-colors: active`, les 11 routes principales ont été rouvertes à 390 px : chaque titre reste présent, le texte reprend les couleurs système et aucune page ne déborde horizontalement. Les rendus Paie et Journal ont été inspectés visuellement ; le tableau garde son défilement horizontal interne et les contrôles restent lisibles.

Dans le tableau Paie, les 16 colonnes déclarées restent disponibles ; les en-têtes affichent les abréviations compactes approuvées et chaque bouton de tri expose le libellé complet. Le sélecteur montre les 16 options avec une case visible par option, reste dans le viewport et défile ; `Fin` amène les dernières colonnes à l’écran et `Échap` ferme le menu. Ces points ont été vérifiés sur Compose et sont aussi couverts par les E2E du sélecteur.

### Thèmes, accessibilité et responsive

- Le catalogue `/catalogue` est contrôlé par axe en clair et en sombre dans les E2E ; les tests CI du sélecteur, du dialogue, du tableau et du graphique couvrent leurs principaux parcours clavier.
- Les pages principales ont été parcourues à 390 px en thème clair puis en thème sombre avec contraste forcé ; les 11 titres sont présents et aucune page ne déborde horizontalement.
- Les thèmes clair et sombre répondent au bouton de bascule et l’état sombre a été rétabli après le contrôle. Le test axe du dépôt couvre le catalogue clair/sombre, pas toutes les routes en contraste forcé.
- Un rendu Paie en contraste forcé a été inspecté : les cases, le défilement du sélecteur et les repères de focus restent visibles.
- Le CI vérifie aussi les cibles tactiles et les interactions mobiles ciblées ; cette passe ne simule pas un lecteur d’écran.

### Lecteur d’écran réel

Le 2026-10-14, l’utilisateur a parcouru le catalogue avec Narrateur Windows et a confirmé que les annonces et actions se sont bien déroulées pour le sélecteur multiple, l’ouverture/fermeture du dialogue et le retour du focus, le tri de l’en-tête et l’action de ligne du tableau, ainsi que le parcours au clavier du graphique. Cette validation manuelle complète les arbres d’accessibilité et les tests clavier automatisés ; elle ne remplace pas l’inspection visuelle exhaustive ci-dessous.

## Couverture traçable des composants partagés

Les états ci-dessous correspondent aux assertions déjà présentes dans les specs ; ils ne signifient pas que chaque variante a fait l’objet d’une inspection visuelle manuelle.

| Composant | États et interactions vérifiés par les specs | Parcours navigateur complémentaire |
|---|---|---|
| `stp-icon` | Icône connue/inconnue, décorative, taille héritée ou fixée | Catalogue axe clair/sombre |
| `stp-button` | Variantes, bouton/lien, icône seule, chargement, clic bloqué | Actions et formulaires E2E |
| `stp-badge` | Valeur et sévérités | Catalogue axe clair/sombre |
| `stp-dialog` | Fermé/ouvert, Échap, fermeture, non-fermé, focus piégé, tiroir | Focus piégé, retour du focus et axe du dialogue |
| `stp-menu-button` | Ouvert, action, action désactivée, bouton désactivé, icône seule | Menus d’import E2E |
| `stp-split-button` | Action principale, menu secondaire, désactivation | Import Paie E2E |
| `stp-select` | Simple/multiple, filtrage, vide, chargement, désactivé, effacement, page suivante, valeur hors page | Flèches/Entrée/Échap, `End`, viewport mobile, 16 cases Paie |
| `stp-table` | Vide/chargement, tri, pagination mémoire/serveur, ligne clavier, largeur et ordre des colonnes | Tri, pagination et réordonnancement au clavier |
| `stp-number-input` | Format `fr-FR`, bornes, décimales, saisie vide, désactivé, focus, erreur | Formulaires E2E |
| `stp-password-input` | Masquer/afficher, valeur, validation, désactivé, focus | Connexion et formulaires E2E |
| `stp-date-input` | Liaison/format, effacement, champ touché, désactivé, focus | Formulaires E2E |
| `stp-month-input` | Placeholder, ouverture, choix, Échap, erreur, désactivé, focus | Assistant d’export Paie E2E |
| `stp-message` | Information, avertissement et erreur avec annonces adaptées | Catalogue axe clair/sombre |
| `stp-field-error` | Non touché, touché/invalide, plusieurs règles, retour valide | Formulaires E2E |
| `stp-chart` | Nom accessible, création, mise à jour, clic, destruction, couleurs système en contraste forcé, bascule à chaud forcé/normal | Axe clair/sombre, parcours clavier, sélection et annonce E2E ; inspection du canvas en contraste forcé |

Références de specs : `frontend/src/app/shared/ui/<composant>/*.spec.ts` ; parcours catalogue : `frontend/e2e/catalogue.spec.ts`. Le thème système est testé dans `frontend/src/app/core/theme/theme.service.spec.ts`.

## Contrôle des jetons

Un scan des styles du frontend ne trouve pas de couleurs littérales, d’ombres d’élévation, de rayons ni de durées hors de la source de jetons. Les couleurs, opacités et élévations sont dans `frontend/src/styles/_tokens.scss`. Les deux `box-shadow` de `table.component.scss` sont des séparateurs géométriques avec couleurs de jetons, pas des ombres d’élévation.

Les espacements codés en dur trouvés par le scan ont été rattachés à l’échelle : le badge de filtres utilise `--space-xs`, les états vides des cartes/analytique utilisent désormais `--space-2xl` comme maximum de leur `clamp()`, et le retrait réservé à l’icône du sélecteur réutilise `--space-md`. Le `margin: -1px` du helper `visually-hidden` est une technique de masquage accessible, pas un espacement de mise en page.

## Écart visuel découvert et correction locale

En thème sombre avec `forced-colors: active`, le navigateur remplace les couleurs DOM par la palette système, mais le canvas Chart.js garde les couleurs que son consommateur lui transmet. Dans le catalogue, les libellés d’axes et la grille restent bleu-gris foncé sur le canevas système noir. Le code Chart.js ne peut pas être corrigé par les seules règles CSS `@media (forced-colors: active)`.

La convention exige que les graphiques restent utilisables en contraste forcé. L’utilisateur a validé l’adaptation du composant partagé `stp-chart`. Celui-ci détecte `forced-colors: active`, résout les couleurs `CanvasText`, `Canvas` et `GrayText` dans le contexte canvas, applique ces couleurs aux axes, grilles, légende et infobulle, puis recrée le graphique lors d’une bascule de préférence. Les couleurs des jeux de données restent celles de leur entité. Un test unitaire vérifie l’activation et le retour à la palette Chart.js normale ; le navigateur a confirmé visuellement les axes et la grille en contraste forcé.

La page Catalogue expose aussi le tableau des données du graphique à la demande ; il affiche les trois périodes et les montants, et le nom accessible annonce la mesure, l’unité, la période et les touches de navigation.

## Vérifications restantes avant clôture

1. Faire passer cette révision locale en CI et vérifier que tous les jobs sont verts.
2. Après pull de la nouvelle image et démarrage Compose par le propriétaire, contrôler le rendu du graphique Paie en contraste forcé, son tableau de données et le thème normal. Supprimer ensuite ce rapport uniquement après preuve CI et runtime.

Le contrôle reste ouvert dans le suivi jusqu’à la fin de cette revue et la mise à jour des preuves.

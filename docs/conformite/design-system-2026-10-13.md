# Contrôle du Design System — 2026-10-13

## Périmètre et statut

Contrôle du kit partagé et des principaux écrans de l’application, selon [`conventions/design-system.md`](../../conventions/design-system.md), dans l’image Compose accessible sur `http://127.0.0.1:5002`.

**Statut : partiel, en attente de validation assistive et de CI sur les derniers changements locaux.** Le parcours CI de `850374c` est vert et le contrôle du navigateur couvre les écrans listés ci-dessous. Il manque encore une validation avec un lecteur d’écran et la revalidation CI des changements de jetons faits pendant cette passe ; le statut ne peut donc pas être déclaré conforme à 100 %.

## Preuves d’exécution

### CI et image

Le [run GitHub Actions 38459437213](https://github.com/HmaydaAbdo/Rh-ERP/actions/runs/38459437213), sur `850374c` (`fix ci prob`), est terminé avec succès : les cinq jobs `postgres`, `frontend`, `backend`, `full-stack` et `backup` sont verts. Le job frontend passe les tests Angular (665 résultats), le build de production, les E2E, puis la construction et la publication de l’image frontend.

Les modifications de jetons ci-dessous sont locales et postérieures à ce run. La compilation Angular locale s’arrête sur l’erreur d’accès de Sass Embedded à `sass.snapshot` (OS error 5), mais les quatre feuilles modifiées compilent avec l’API Sass JavaScript. Une nouvelle CI devra valider ces modifications après leur push.

Le serveur répond et les écrans authentifiés sont consultables sur le port 5002. La comparaison de l’identifiant d’image Compose avec l’image produite par le run n’a pas pu être faite : le client Docker de cet environnement est refusé par le pipe Docker Desktop.

### Contrôle navigateur de l’application

Connexion réussie à l’instance locale. Les écrans Employés, Chantiers, Fonctions, Équipes, Utilisateurs, Rôles, Paramètres, Journal d’audit et les trois vues Paie ont été parcourus. Les routes Paie tabulaire/cartes/analytique s’ouvrent ; l’analytique affiche son état vide parce qu’aucun bulletin n’est disponible dans cette instance. Les pages sans données montrent un état vide plutôt qu’un écran cassé.

À 390 px, les neuf écrans principaux (Paie, Employés, Chantiers, Fonctions, Équipes, Utilisateurs, Rôles, Paramètres et Journal) ont une largeur de page identique au viewport. Le débordement des tableaux reste dans leur conteneur défilant.

En `forced-colors: active`, les neuf écrans principaux ont été rouverts à 390 px : le titre reste présent, le texte reprend les couleurs système, le focus reçoit un contour système et aucun débordement horizontal de page n’est apparu. Une inspection visuelle complémentaire du rendu Paie confirme les repères de navigation, les contrôles, le tableau et sa barre de défilement.

Dans le tableau Paie, les 16 colonnes déclarées restent disponibles ; les intitulés longs sont accessibles, et les abréviations compactes approuvées sont affichées dans l’en-tête. Le sélecteur contient les 16 options avec une case visible par option, une barre de défilement et un placement dans le viewport ; `Fin` amène la dernière option à l’écran. Ces points ont été vérifiés sur Compose et sont aussi couverts par les E2E du sélecteur.

### Thèmes, accessibilité et responsive

- Le catalogue `/catalogue` est contrôlé par axe en clair et en sombre dans les E2E ; les tests CI du sélecteur, du dialogue, du tableau et du graphique couvrent leurs principaux parcours clavier.
- Les pages principales ont été parcourues en thème clair à 390 px puis en thème sombre avec contraste forcé ; les neuf titres sont présents et la page ne déborde pas horizontalement.
- Le rendu `forced-colors` de Paie a été inspecté visuellement ; le focus clavier expose un contour `Highlight` de 2 px. Le test axe du dépôt couvre le catalogue clair/sombre, pas toutes les routes en contraste forcé.
- Le CI vérifie aussi les cibles tactiles et les interactions mobiles ciblées ; cette passe ne simule pas un lecteur d’écran.

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
| `stp-chart` | Nom accessible, création, mise à jour, clic, destruction | Flèches, Début/Fin et sélection clavier |

Références de specs : `frontend/src/app/shared/ui/<composant>/*.spec.ts` ; parcours catalogue : `frontend/e2e/catalogue.spec.ts`. Le thème système est testé dans `frontend/src/app/core/theme/theme.service.spec.ts`.

## Contrôle des jetons

Un scan des styles du frontend ne trouve pas de couleurs littérales, d’ombres d’élévation, de rayons ni de durées hors de la source de jetons. Les couleurs, opacités et élévations sont dans `frontend/src/styles/_tokens.scss`. Les deux `box-shadow` de `table.component.scss` sont des séparateurs géométriques avec couleurs de jetons, pas des ombres d’élévation.

Les espacements codés en dur trouvés par le scan ont été rattachés à l’échelle : le badge de filtres utilise `--space-xs`, les états vides des cartes/analytique utilisent désormais `--space-2xl` comme maximum de leur `clamp()`, et le retrait réservé à l’icône du sélecteur réutilise `--space-md`. Le `margin: -1px` du helper `visually-hidden` est une technique de masquage accessible, pas un espacement de mise en page.

## Écarts avant clôture à 100 %

1. Faire une validation avec une technologie d’assistance réelle (par exemple NVDA) sur les annonces, le focus et les actions du kit, notamment tableau, menus, sélecteurs et graphique. Les arbres d’accessibilité et les tests clavier ne remplacent pas cette validation.
2. Rejouer le build et les E2E CI après push des trois modifications locales de styles/jetons.
3. Compléter la revue visuelle des états hover, focus-visible, chargement, erreur et désactivé pour chaque variante dans les deux thèmes et en contraste forcé. Les tests prouvent déjà certains de ces états, mais ne constituent pas une inspection visuelle exhaustive de chaque écran.

Le tableau de conformité reste **partiel** jusqu’à obtention de ces preuves.
